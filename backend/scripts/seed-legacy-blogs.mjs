import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../src/services/firebaseAdmin.js';
import { LEGACY_BLOGS } from '../src/data/legacyBlogs.js';

function slugifyTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function run() {
  const firestore = getAdminFirestore();
  if (!firestore) {
    throw new Error('Firestore Admin is not configured (check FIREBASE_SERVICE_ACCOUNT_PATH)');
  }
  let inserted = 0;
  for (const row of LEGACY_BLOGS) {
    const slug = row.slug || slugifyTitle(row.title);
    const existing = await firestore.collection('blogs').where('slug', '==', slug).limit(1).get();
    if (!existing.empty) continue;
    await firestore.collection('blogs').add({
      title: row.title || '',
      slug,
      excerpt: row.excerpt || '',
      content: row.content || '',
      coverImage: row.coverImage || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      status: row.status === 'draft' ? 'draft' : 'published',
      author: row.author || 'Admin',
      readTime: row.readTime || '5 min read',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    inserted += 1;
  }
  console.log(`Seed complete. Inserted ${inserted} blog(s).`);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});

