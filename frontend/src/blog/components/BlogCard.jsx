import React from "react";
import "../styles/BlogCard.css";
const BlogCard = ({ blog }) => {
  return (
    <>

      <div>

      </div>
      <div className="blog-card">
        <div className="blog-image-wrapper">
          <img
            src={blog.image}
            alt={blog.title}
            className="blog-image"
          />
        </div>

        <div className="blog-meta">
          <span className="blog-author">{blog.author}</span>
          <span className="blog-readtime">{blog.readTime}</span>
        </div>

        <h2 className="blog-title">{blog.title}</h2>

        <div className="blog-desc">{blog.description}</div>

        <div className="blog-divider"></div>
      </div>
    </>
  );
};

export default BlogCard;
