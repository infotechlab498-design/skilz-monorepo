import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../services/api';
import '../styles/adminBlogs.css';

function slugifyTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const emptyForm = {
  title: '',
  slug: '',
  slugManual: false,
  excerpt: '',
  content: '',
  tags: '',
  status: 'draft',
  readTime: '5 min read',
};

export default function AdminBlogs({ onNotify }) {
  const authUser = useSelector((s) => s.auth.user);
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listFilter, setListFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const notify = useCallback(
    (msg) => {
      if (typeof onNotify === 'function') onNotify(msg);
    },
    [onNotify]
  );

  const loadBlogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminBlogs('all');
      setBlogs(Array.isArray(res?.blogs) ? res.blogs : []);
    } catch (e) {
      notify(e.message || 'Failed to load blogs');
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadBlogs();
  }, [loadBlogs]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview('');
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const stats = useMemo(() => {
    const total = blogs.length;
    const published = blogs.filter((b) => b.status === 'published').length;
    const drafts = blogs.filter((b) => b.status === 'draft').length;
    return { total, published, drafts };
  }, [blogs]);

  const visibleBlogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return blogs.filter((b) => {
      const byStatus = listFilter === 'all' ? true : b.status === listFilter;
      if (!byStatus) return false;
      if (!q) return true;
      return (
        String(b.title || '').toLowerCase().includes(q) ||
        String(b.author || '').toLowerCase().includes(q) ||
        String(b.excerpt || '').toLowerCase().includes(q)
      );
    });
  }, [blogs, search, listFilter]);

  const resetForm = useCallback(() => {
    setEditingId('');
    setForm(emptyForm);
    setCoverFile(null);
    setCoverPreview('');
  }, []);

  const openCreate = () => {
    resetForm();
    setView('editor');
  };

  const openEdit = (blog) => {
    setEditingId(blog.id);
    setForm({
      title: blog.title || '',
      slug: blog.slug || '',
      slugManual: true,
      excerpt: blog.excerpt || '',
      content: blog.content || '',
      tags: Array.isArray(blog.tags) ? blog.tags.join(', ') : '',
      status: blog.status === 'published' ? 'published' : 'draft',
      readTime: blog.readTime || '5 min read',
    });
    setCoverFile(null);
    setCoverPreview(blog.coverImage || '');
    setView('editor');
  };

  const buildFormData = (statusOverride) => {
    const fd = new FormData();
    const slug = (form.slug || slugifyTitle(form.title)).trim().toLowerCase();
    fd.append('title', form.title.trim());
    fd.append('slug', slug);
    fd.append('excerpt', form.excerpt.trim());
    fd.append('content', form.content.trim());
    fd.append('tags', form.tags.trim());
    fd.append('author', String(authUser?.email || '').trim() || 'Admin');
    fd.append('status', statusOverride || form.status);
    fd.append('readTime', form.readTime.trim() || '5 min read');
    if (coverFile) fd.append('cover', coverFile);
    return fd;
  };

  const savePost = async (statusOverride) => {
    if (!form.title.trim() || !form.content.trim()) {
      notify('Post title and content are required');
      return;
    }
    setSaving(true);
    try {
      const fd = buildFormData(statusOverride);
      if (editingId) {
        await api.updateBlog(editingId, fd);
        notify('Post updated');
      } else {
        await api.createBlog(fd);
        notify('Post created');
      }
      await loadBlogs();
      setView('list');
      resetForm();
    } catch (e) {
      notify(e.message || 'Unable to save post');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (blog) => {
    const next = blog.status === 'published' ? 'draft' : 'published';
    try {
      const fd = new FormData();
      fd.append('status', next);
      await api.updateBlog(blog.id, fd);
      notify(next === 'published' ? 'Post published' : 'Moved to draft');
      await loadBlogs();
    } catch (e) {
      notify(e.message || 'Unable to update status');
    }
  };

  const deleteConfirmed = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteBlog(deleteTarget.id);
      notify('Post deleted');
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await loadBlogs();
    } catch (e) {
      notify(e.message || 'Delete failed');
    }
  };

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const result = await api.seedDefaultBlogs();
      notify(`Seeded ${result.seeded || 0} default blogs`);
      await loadBlogs();
    } catch (e) {
      notify(e.message || 'Seeding failed');
    } finally {
      setSeeding(false);
    }
  };

  const onTitleChange = (value) => {
    setForm((prev) => {
      const next = { ...prev, title: value };
      if (!prev.slugManual) next.slug = slugifyTitle(value);
      return next;
    });
  };

  return (
    <div className="adminBlogsV2">
      {view === 'list' ? (
        <>
          <div className="adminBlogsV2Top">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts..."
              className="adminBlogsV2Search"
            />
            <button type="button" className="adminBlogsV2Primary" onClick={openCreate}>
              + Create Blog
            </button>
          </div>

          <h2 className="adminBlogsV2Title">Blog Management</h2>
          <p className="adminBlogsV2Sub">Oversee and organize your platform editorial content.</p>

          <div className="adminBlogsV2Stats">
            <article className="adminBlogsV2Stat">
              <small>TOTAL BLOGS</small>
              <h3>{loading ? '...' : stats.total.toLocaleString()}</h3>
            </article>
            <article className="adminBlogsV2Stat">
              <small>PUBLISHED</small>
              <h3>{loading ? '...' : stats.published.toLocaleString()}</h3>
            </article>
            <article className="adminBlogsV2Stat">
              <small>DRAFTS</small>
              <h3>{loading ? '...' : stats.drafts.toLocaleString()}</h3>
            </article>
          </div>

          <section className="adminBlogsV2TableCard">
            <div className="adminBlogsV2TableHead">
              <strong>RECENT POSTS</strong>
              <div className="adminBlogsV2Chips">
                {['all', 'published', 'draft'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={listFilter === item ? 'isOn' : ''}
                    onClick={() => setListFilter(item)}
                  >
                    {item === 'all' ? 'All' : item === 'published' ? 'Published' : 'Draft'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="adminBlogsV2Empty">Loading posts...</p>
            ) : visibleBlogs.length === 0 ? (
              <div className="adminBlogsV2EmptyWrap">
                <p className="adminBlogsV2Empty">No posts yet. Seed your previous articles to Firebase.</p>
                <button type="button" className="adminBlogsV2Ghost" onClick={seedDefaults} disabled={seeding}>
                  {seeding ? 'Seeding...' : 'Seed Existing Blog Content'}
                </button>
              </div>
            ) : (
              <div className="adminBlogsV2TableWrap">
                <table className="adminBlogsV2Table">
                  <thead>
                    <tr>
                      <th>TITLE</th>
                      <th>AUTHOR</th>
                      <th>STATUS</th>
                      <th>READ TIME</th>
                      <th>DATE</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBlogs.map((blog) => (
                      <tr key={blog.id}>
                        <td className="adminBlogsV2TitleCell">
                          {blog.coverImage ? <img src={blog.coverImage} alt="" /> : <span className="placeholder" />}
                          <div>
                            <strong>{blog.title}</strong>
                            <small>{blog.excerpt || '-'}</small>
                          </div>
                        </td>
                        <td>{blog.author || '-'}</td>
                        <td>
                          <span className={`status ${blog.status === 'published' ? 'ok' : 'warn'}`}>
                            {blog.status === 'published' ? 'VERIFIED' : 'PENDING'}
                          </span>
                        </td>
                        <td>{blog.readTime || '-'}</td>
                        <td>{blog.createdAt ? new Date(blog.createdAt).toLocaleDateString() : '-'}</td>
                        <td>
                          <div className="adminBlogsV2Actions">
                            <button type="button" onClick={() => openEdit(blog)}>
                              Edit
                            </button>
                            <button type="button" onClick={() => toggleStatus(blog)}>
                              {blog.status === 'published' ? 'Unpublish' : 'Publish'}
                            </button>
                            <button type="button" className="danger" onClick={() => setDeleteTarget(blog)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="adminBlogsV2EditorTop">
            <div className="adminBlogsV2Breadcrumbs">Dashboard &gt; Blog Posts &gt; {editingId ? 'Edit Post' : 'New Post'}</div>
            <div className="adminBlogsV2EditorBtns">
              <button type="button" className="adminBlogsV2Ghost" onClick={() => setView('list')}>
                Cancel
              </button>
              <button type="button" className="adminBlogsV2Primary" onClick={() => savePost(form.status)} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <h2 className="adminBlogsV2Title">{editingId ? 'Edit Article' : 'Create New Article'}</h2>
          <p className="adminBlogsV2Sub">Compose and configure your next piece for the gaming audience.</p>

          <div className="adminBlogsV2EditorLayout">
            <main className="adminBlogsV2EditorMain">
              <section className="editorCard">
                <label>POST TITLE</label>
                <input value={form.title} onChange={(e) => onTitleChange(e.target.value)} placeholder="e.g. Top 10 Competitive Gaming Strategies for 2024" />
                <div className="split2">
                  <div>
                    <label>AUTHOR NAME</label>
                    <input value={String(authUser?.email || 'Admin')} readOnly />
                  </div>
                  <div>
                    <label>ESTIMATED READ TIME</label>
                    <input value={form.readTime} onChange={(e) => setForm((p) => ({ ...p, readTime: e.target.value }))} placeholder="5 mins" />
                  </div>
                </div>
              </section>

              <section className="editorCard">
                <label>POST CONTENT</label>
                <textarea
                  className="contentArea"
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  placeholder="Start writing your gaming masterpiece..."
                />
              </section>
            </main>

            <aside className="adminBlogsV2EditorSide">
              <section className="sideCard">
                <h4>PUBLISH SETTINGS</h4>
                <label>POST STATUS</label>
                <div className="seg2">
                  <button
                    type="button"
                    className={form.status === 'draft' ? 'isOn' : ''}
                    onClick={() => setForm((p) => ({ ...p, status: 'draft' }))}
                  >
                    DRAFT
                  </button>
                  <button
                    type="button"
                    className={form.status === 'published' ? 'isOn' : ''}
                    onClick={() => setForm((p) => ({ ...p, status: 'published' }))}
                  >
                    PUBLISHED
                  </button>
                </div>
              </section>

              <section className="sideCard">
                <h4>FEATURED IMAGE</h4>
                <div className="previewBox">{coverPreview ? <img src={coverPreview} alt="Cover" /> : <span>Replace Cover Image</span>}</div>
                <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                <label>IMAGE URL / SLUG</label>
                <input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value, slugManual: true }))} placeholder="post-slug" />
              </section>

              <section className="sideCard">
                <h4>SEO META</h4>
                <label>Meta Description</label>
                <textarea value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} placeholder="Brief summary for search results..." />
                <label>TAGS</label>
                <input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="security, uiux, esports" />
              </section>
            </aside>
          </div>
        </>
      )}

      {deleteTarget ? (
        <div className="adminBlogsV2Modal" onClick={() => setDeleteTarget(null)} role="presentation">
          <div className="adminBlogsV2ModalCard" onClick={(e) => e.stopPropagation()} role="presentation">
            <h3>Are you sure?</h3>
            <p>
              This action will permanently remove <strong>{deleteTarget.title}</strong>. This cannot be undone.
            </p>
            <button type="button" className="dangerFull" onClick={deleteConfirmed}>
              Delete Post
            </button>
            <button type="button" className="adminBlogsV2Ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
