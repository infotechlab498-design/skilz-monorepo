import React from "react";
import "../styles/BlogListItem.css";

const BlogListItem = ({ blog }) => {
  return (
    <div className="blog-list-item">
      <div className="blog-thumb">
        <img src={blog.image} alt={blog.title} />
      </div>

      <div className="blog-content">
        <div className="blog-meta">
          <span className="blog-author">{blog.author}</span>
          <span className="blog-time">{blog.readTime}</span>
       </div>

        <h3 className="blog-title">{blog.title}</h3>
      </div>
    </div>
  );
};

export default BlogListItem;
