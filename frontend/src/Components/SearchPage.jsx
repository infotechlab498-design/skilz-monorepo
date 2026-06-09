import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "./Layout";
import { api } from "../services/api.js";

function useSearchQuery() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search).get("q") || "", [location.search]);
}

const SearchPage = () => {
  const query = useSearchQuery();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await api.searchGlobal({ q, limit: 24 });
        if (!cancelled) {
          const rows = Array.isArray(data?.results) ? data.results : [];
          setResults(rows);
          setNextCursor(data?.nextCursor || null);
          api.trackSearchAnalytics({
            eventType: rows.length > 0 ? "query" : "no_results",
            q,
            resultCount: rows.length,
            source: "search_page",
          }).catch(() => {});
        }
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          setNextCursor(null);
          setError(err?.message || "Search unavailable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query]);

  const handleLoadMore = async () => {
    const q = query.trim();
    if (!nextCursor || q.length < 2 || loadingMore) return;
    try {
      setLoadingMore(true);
      const data = await api.searchGlobal({ q, limit: 24, cursor: nextCursor });
      const rows = Array.isArray(data?.results) ? data.results : [];
      setResults((prev) => [...prev, ...rows]);
      setNextCursor(data?.nextCursor || null);
    } catch (err) {
      setError(err?.message || "Could not load more results");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Layout>
      <div style={{ padding: "100px 20px", color: "#fff", maxWidth: "980px", margin: "0 auto" }}>
        <h1 style={{ textAlign: "center" }}>Search Results</h1>
        <p style={{ opacity: 0.75, textAlign: "center" }}>
          Showing results for: <strong>"{query}"</strong>
        </p>

        {loading ? <p style={{ textAlign: "center", opacity: 0.7 }}>Searching...</p> : null}
        {error ? <p style={{ textAlign: "center", color: "#ff8f8f" }}>{error}</p> : null}
        {!loading && !error && query.trim().length < 2 ? (
          <p style={{ textAlign: "center", opacity: 0.7 }}>Type at least 2 characters to search.</p>
        ) : null}

        {!loading && !error && query.trim().length >= 2 ? (
          <div style={{ marginTop: "30px", display: "grid", gap: "14px" }}>
            {results.length > 0 ? (
              results.map((item) => (
                <Link
                  to={item.route || `/search?q=${encodeURIComponent(item.title || query)}`}
                  key={item.id || `${item.type}-${item.title}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                  onClick={() => {
                    api.trackSearchAnalytics({
                      eventType: "click",
                      q: query,
                      clickedResultId: item.id || "",
                      clickedRoute: item.route || "",
                      clickedType: item.type || "",
                      source: "search_page",
                    }).catch(() => {});
                  }}
                >
                  <div
                    style={{
                      background: "#202738",
                      padding: "18px 20px",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                      <h3 style={{ color: "#1da1f2", margin: 0 }}>{item.title || "Untitled"}</h3>
                      <span style={{ fontSize: "11px", opacity: 0.8, textTransform: "uppercase" }}>
                        {item.type || "result"}
                      </span>
                    </div>
                    <p style={{ fontSize: "14px", opacity: 0.72, marginTop: "8px", marginBottom: 0 }}>
                      {item.description || "Open this result"}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <p style={{ opacity: 0.6, textAlign: "center", marginTop: "20px" }}>No results found.</p>
            )}
          </div>
        ) : null}

        {!loading && !error && results.length > 0 && nextCursor ? (
          <div style={{ marginTop: "18px", textAlign: "center" }}>
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                background: "#1da1f2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 16px",
                cursor: loadingMore ? "not-allowed" : "pointer",
                opacity: loadingMore ? 0.7 : 1,
              }}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default SearchPage;
