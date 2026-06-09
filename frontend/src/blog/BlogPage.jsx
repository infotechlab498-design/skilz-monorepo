import React, { useState } from "react";
import { Link } from "react-router-dom";
import BlogCard from "./components/BlogCard";
import BlogListItem from "./components/BlogListItem";
import SearchBar from "./components/SearchBar";
import "./styles/BlogPage.css";
import BlogHeader from "./components/BlogHeader";
import NewsletterSection from "../home/NewsletterSection";

function Blogepage({ blogs, onSelectBlog: _onSelectBlog }) {
  
  const [query, setQuery] = useState("");

  const q = query.toLowerCase();
  const filteredBlogs = blogs.filter((blog) => {
    const title = String(blog.title || "").toLowerCase();
    const excerpt = String(blog.description || blog.excerpt || "").toLowerCase();
    return title.includes(q) || excerpt.includes(q);
  });

  return (
 <>
    <BlogHeader/>
    
    <section className="blog-page">
      <SearchBar onSearch={setQuery} />

      <div className="blog-layout">
        <div className="main-blogs">
          {filteredBlogs.map((blog) => (
            <Link
              to={`/blogs/${encodeURIComponent(blog.slug || blog.id)}`}
              key={blog.slug || blog.id}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div>
                <BlogCard blog={blog} />
              </div>
            </Link>
          ))}
        </div>

        <aside className="side-blogs">
          {filteredBlogs.slice(0, 5).map((blog) => (
            <Link
              to={`/blogs/${encodeURIComponent(blog.slug || blog.id)}`}
              key={blog.slug || blog.id}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div>
                <BlogListItem blog={blog} />
              </div>
            </Link>
          ))}
        </aside>
      </div>
    </section>
        <NewsletterSection/>
          </>
   
  );
}

export default Blogepage;
