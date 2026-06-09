import fs from 'fs/promises';
import { lock } from 'proper-lockfile';

/** Per-file promise chain so rapid writes serialize (lock + ordering). */
const writeChains = new Map();

/**
 * Same as `safeReadWrite`, but queues updates per `filePath` so callers cannot
 * interleave read-modify cycles from overlapping async calls.
 */
export const safeReadWriteQueued = async (filePath, updateFn) => {
    const prev = writeChains.get(filePath) || Promise.resolve();
    const done = prev
        .then(() => safeReadWrite(filePath, updateFn))
        .catch((err) => {
            throw err;
        });
    writeChains.set(
        filePath,
        done.catch(() => {
            /* swallow so chain continues */
        })
    );
    return done;
};

/**
 * Safe atomic read-modify-write using proper-lockfile.
 * Prevents race conditions under concurrent requests.
 * @param {string} filePath - absolute path to JSON file
 * @param {Function} updateFn - receives parsed array/object, returns updated version
 */
export const safeReadWrite = async (filePath, updateFn) => {
    // Ensure file exists before locking
    try {
        await fs.access(filePath);
    } catch {
        await fs.writeFile(filePath, '[]', 'utf-8');
    }

    const release = await lock(filePath, { retries: { retries: 5, minTimeout: 50 } });
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(raw || '[]');
        const updated = await updateFn(data);
        await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
        return updated;
    } finally {
        await release();
    }
};

// Legacy helpers — still used by older controllers
export const readJsonFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data || '[]');
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
};

export const writeJsonFile = async (filePath, data) => {
    await safeReadWriteQueued(filePath, async () => data);
};
