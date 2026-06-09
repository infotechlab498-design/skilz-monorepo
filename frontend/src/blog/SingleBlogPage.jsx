
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBlogs, getBlogDetailBySlug } from "./blogServices";
import Blogepage from "./BlogPage";
import BlogView from "./components/BlogView";
import Layout from "../Components/Layout";

function BlogPageContainer() {
  const [blogs, setBlogs] = useState([]);
  const [selectedBlog, setSelectedBlog] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const { slug } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getBlogs()
      .then((fetched) => {
        if (!cancelled) setBlogs(fetched);
      })
      .catch(() => {
        if (!cancelled) setBlogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!slug) {
      setSelectedBlog(null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setSelectedBlog(null);
    setDetailLoading(true);
    setDetailError("");
    getBlogDetailBySlug(slug)
      .then((detail) => {
        if (!cancelled) {
          setSelectedBlog(detail);
          setDetailError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedBlog(null);
          setDetailError("This post could not be found or is not published.");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <Layout>
      {slug && detailLoading ? (
        <div className="blog-page" style={{ padding: "2rem", textAlign: "center" }}>
          Loading…
        </div>
      ) : null}
      {slug && !detailLoading && detailError ? (
        <div className="blog-page" style={{ padding: "2rem", textAlign: "center" }}>
          <p>{detailError}</p>
          <button type="button" onClick={() => navigate("/blogs")}>
            Back to blogs
          </button>
        </div>
      ) : null}
      {selectedBlog && !detailLoading ? (
        <BlogView
          blog={selectedBlog}
          popularBlogs={blogs.filter((b) => b.slug !== selectedBlog.slug)}
          onBack={() => navigate("/blogs")}
          onSelectBlog={(blogSlug) => navigate(`/blogs/${blogSlug}`)}
        />
      ) : null}
      {!slug ? <Blogepage blogs={blogs} /> : null}
    </Layout>
  );
}

export default BlogPageContainer;
