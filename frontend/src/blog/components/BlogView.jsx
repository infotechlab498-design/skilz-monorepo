import React, { useMemo } from "react";
import DOMPurify from "dompurify";
import "../styles/BlogPostView.css";

function looksLikeHtml(text) {
  return /<[a-z][\s\S]*>/i.test(String(text || ""));
}

const BlogView = ({ blog, popularBlogs, onSelectBlog }) => {
  const mainHtml = useMemo(() => {
    const raw = blog.content || blog.description || "";
    if (!raw.trim()) return "";
    if (!looksLikeHtml(raw)) return "";
    return DOMPurify.sanitize(raw);
  }, [blog.content, blog.description]);

  const plainBody = useMemo(() => {
    const raw = blog.content || blog.description || "";
    if (!raw.trim()) return "";
    if (looksLikeHtml(raw)) return "";
    return raw;
  }, [blog.content, blog.description]);

  return (
    <div className="blog-view">
      <div className="blog-article">
        <h1>{blog.title}</h1>
        <div className="meta">
          <span>{blog.author}</span> • <span>{blog.readTime}</span>
        </div>
      </div>

      {blog.image ? (
        <img className="heroImage" src={blog.image} alt={blog.title} />
      ) : null}

      {mainHtml ? (
        <div className="blog-content-html" dangerouslySetInnerHTML={{ __html: mainHtml }} />
      ) : (
        <p className="description">{plainBody}</p>
      )}

      <div className="popular-blog">
        <h2>Popular Posts</h2>

        <div className="popular-grid">
          {popularBlogs.slice(0, 3).map((item) => (
            <div
              key={item.id}
              className="popular-card"
              onClick={() => onSelectBlog(item.slug || item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelectBlog(item.slug || item.id)}
            >
              {item.image ? <img src={item.image} alt={item.title} /> : null}
              <h4>{item.title}</h4>
              <p>{item.description || item.excerpt}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BlogView;
