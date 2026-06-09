import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import { getAdminFirestore } from '../../src/services/firebaseAdmin.js';

async function main() {
    const db = getAdminFirestore();
    if (!db) {
        console.error('Firestore Admin not configured');
        process.exit(1);
    }
    const snap = await db.collection('questions').get();
    console.log(`Total questions in 'questions' collection: ${snap.size}`);
    
    const activeSnap = await db.collection('questions').where('active', '==', true).get();
    console.log(`Active questions: ${activeSnap.size}`);

    if (activeSnap.size > 0) {
        const first = activeSnap.docs[0].data();
        console.log('Sample question:', JSON.stringify(first, null, 2));
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
