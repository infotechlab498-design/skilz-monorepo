import { api } from '../services/api';

/** @typedef {{ id: string, slug: string, title: string, author: string, readTime: string, image: string, description: string, excerpt?: string, content?: string, tags?: string[] }} BlogCardModel */

/**
 * Published posts for list/cards (no full content).
 * @returns {Promise<BlogCardModel[]>}
 */
export async function getBlogs() {
  const res = await api.getBlogsPublished();
  const rows = Array.isArray(res?.blogs) ? res.blogs : [];
  return rows.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title || '',
    author: b.author || '',
    readTime: b.readTime || '',
    image: b.coverImage || '',
    description: b.excerpt || '',
    excerpt: b.excerpt || '',
    tags: Array.isArray(b.tags) ? b.tags : [],
  }));
}

/**
 * Single published post with full body.
 * @param {string} slug
 * @returns {Promise<BlogCardModel & { content: string }>}
 */
export async function getBlogDetailBySlug(slug) {
  const res = await api.getBlogBySlug(String(slug || '').trim());
  const b = res?.blog;
  if (!b) throw new Error('Blog not found');
  return {
    id: b.id,
    slug: b.slug,
    title: b.title || '',
    author: b.author || '',
    readTime: b.readTime || '',
    image: b.coverImage || '',
    description: b.excerpt || '',
    excerpt: b.excerpt || '',
    content: b.content || '',
    tags: Array.isArray(b.tags) ? b.tags : [],
  };
}
