import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const gitFiles = new Set(
  execSync('git ls-files frontend/src frontend/public shared backend/src/game-engine .vibecheck/truthpack', {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/')),
);

const gitLower = new Map();
for (const f of gitFiles) {
  const k = f.toLowerCase();
  if (!gitLower.has(k)) gitLower.set(k, f);
}

const srcRoot = path.join(repoRoot, 'frontend', 'src');
const issues = [];

function resolveImport(fromFile, spec) {
  const abs = path.normalize(path.join(path.dirname(fromFile), spec)).replace(/\\/g, '/');
  const relFromRepo = abs.replace(`${repoRoot.replace(/\\/g, '/')}/`, '');
  const exts = ['', '.js', '.jsx', '.css', '.png', '.svg', '.json'];
  for (const ext of exts) {
    const candidate = relFromRepo + ext;
    if (gitFiles.has(candidate)) return { ok: true, path: candidate };
    const lc = candidate.toLowerCase();
    if (gitLower.has(lc)) {
      const actual = gitLower.get(lc);
      if (actual !== candidate) {
        return { ok: false, kind: 'case', expected: actual, tried: candidate };
      }
      return { ok: true, path: actual };
    }
  }
  if (spec.includes('/public/')) return { ok: false, kind: 'public-import', tried: relFromRepo };
  return { ok: false, kind: 'missing', tried: relFromRepo };
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?|css)$/.test(ent.name)) {
      const txt = fs.readFileSync(p, 'utf8');
      const re = /from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g;
      let m;
      while ((m = re.exec(txt))) {
        const spec = m[1] || m[2];
        if (!spec?.startsWith('.')) continue;
        const result = resolveImport(p, spec);
        if (!result.ok) {
          issues.push({
            file: p.replace(/\\/g, '/').replace(`${repoRoot.replace(/\\/g, '/')}/`, ''),
            import: spec,
            ...result,
          });
        }
      }
    }
  }
}

walk(srcRoot);

// Public URL references in CSS
const cssFiles = [...gitFiles].filter((f) => f.endsWith('.css') && f.startsWith('frontend/src/'));
for (const rel of cssFiles) {
  const full = path.join(repoRoot, rel);
  const txt = fs.readFileSync(full, 'utf8');
  const re = /url\(['"]?(\/[^'")\s]+)['"]?\)/g;
  let m;
  while ((m = re.exec(txt))) {
    const urlPath = m[1];
    const publicRel = `frontend/public${urlPath}`;
    if (!gitFiles.has(publicRel)) {
      issues.push({
        file: rel,
        import: urlPath,
        kind: 'missing-public-asset',
        expected: publicRel,
      });
    }
  }
}

console.log(JSON.stringify(issues, null, 2));
process.exit(issues.length ? 1 : 0);
