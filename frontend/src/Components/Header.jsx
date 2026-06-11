
import { Link, useNavigate } from "react-router-dom";
import "./Navstyle.css";
import { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { signOutAppSession } from "../services/authService.js";
import { useAuth } from "../hooks/useAuth.js";
import { ADMIN_EMAIL } from "../config/admin.js";
import { api } from "../services/api.js";
import logo from "../assets/skilzLogo1-p.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faBars,
  faTimes,
  faUser,
  faSignOutAlt,
  faCoins,
} from "@fortawesome/free-solid-svg-icons";


const Header = () => {
  const navigate = useNavigate();

  const searchRef = useRef(null);
  const profileRef = useRef(null);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const filtered = searchResults;



  const closeSearch = () => {
    setSearchOpen(false);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  const handleSearchClick = () => {
    if (!searchOpen) {
      setSearchOpen(true);
      setTimeout(() => {
        document.querySelector(".search-input")?.focus();
      }, 100);
      return;
    }

    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
      closeSearch();
    }
  };

  const handleSuggestionClick = (item) => {
    setQuery(item.title || "");
    setActiveIndex(-1);
    api.trackSearchAnalytics({
      eventType: "click",
      q: query,
      clickedResultId: item.id || "",
      clickedRoute: item.route || "",
      clickedType: item.type || "",
      source: "header",
    }).catch(() => {});
    if (item.route) {
      navigate(item.route);
    } else {
      navigate(`/search?q=${encodeURIComponent(item.title || query)}`);
    }
    closeSearch();
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < filtered.length - 1 ? prev + 1 : 0
      );
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : filtered.length - 1
      );
    }

    if (e.key === "Enter") {
      if (activeIndex >= 0 && filtered[activeIndex]) {
        handleSuggestionClick(filtered[activeIndex]);
        return;
      }
      if (query.trim()) {
        navigate(`/search?q=${encodeURIComponent(query)}`);
        closeSearch();
      }
    }

    if (e.key === "Escape") {
      closeSearch();
    }
  };


  useEffect(() => {
    const handleOutsideSearch = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        closeSearch();
      }
    };

    document.addEventListener("mousedown", handleOutsideSearch);
    return () => document.removeEventListener("mousedown", handleOutsideSearch);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!searchOpen || q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError("");
        const data = await api.searchGlobal({ q, limit: 8 });
        const rows = Array.isArray(data?.results) ? data.results : [];
        setSearchResults(rows);
        api.trackSearchAnalytics({
          eventType: rows.length > 0 ? "query" : "no_results",
          q,
          resultCount: rows.length,
          source: "header",
        }).catch(() => {});
      } catch (err) {
        setSearchResults([]);
        setSearchError(err?.message || "Search unavailable");
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchOpen]);





  const { user: authUser, isAuthenticated } = useAuth();
  const availableCoins = Number(useSelector((state) => state.user.coins) || 0);
  const isAdmin = String(authUser?.email || "").toLowerCase() === ADMIN_EMAIL;

  const handleLogout = async () => {
    setProfileOpen(false);
    await signOutAppSession();
    navigate("/signin");
  };

  useEffect(() => {
    const handleOutsideProfile = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideProfile);
    return () =>
      document.removeEventListener("mousedown", handleOutsideProfile);
  }, []);


  return (
    <header className="menu">
      {/*Logo */}
      <div className="frame">
        <div className="div">
          <div className="ion-game-controller" />
          {/* <span className="text-wrapper-2">Prime</span> */}
          <img src={logo} alt="logo" className="header-logo-img" />
        </div>
        <div className="frame-2">
          {/* <span className="text-wrapper-3">Gaming</span> */}
        </div>
      </div>

      {/* Search */}

      
      <div className="search-container" ref={searchRef}>
        <div className={`search-wrapper ${searchOpen ? "open" : ""}`}>
          <input
            type="text"
            className="search-input"
            placeholder="Search games, guides..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
          />

          {showSuggestions && searchOpen && (
            <ul className="search-suggestions">
              {filtered.length > 0 ? (
                filtered.map((item, index) => (
                  <li
                    key={item.id || `${item.type}-${item.title}`}
                    className={index === activeIndex ? "active" : ""}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSuggestionClick(item)}
                  >
                    <span>{item.title}</span>
                    <small className="search-item-type">{item.type}</small>
                  </li>
                ))
              ) : searchLoading ? (
                <li className="no-result">Searching...</li>
              ) : searchError ? (
                <li className="no-result">{searchError}</li>
              ) : (
                <li className="no-result">No results</li>
              )}
            </ul>
          )}
        </div>

        <div className="iconoir-search" onClick={handleSearchClick}>
          <FontAwesomeIcon icon={faSearch} />
        </div>
      </div>

      {/* Desktop Nav */}

      <nav className="desktop-nav-menus">
        <Link to="/">Home</Link>
        <Link to="/blogs">Blogs</Link>
        <Link to="/leaderboard">Leaderboard</Link>
        <Link to="/guide">Guides</Link>
        <Link to="/about">About Us</Link>
        <Link to="/contact">Contact Us</Link>
      </nav>


      {/* <Link to="/pricing">Pricing</Link> */}

      {/* <div>
          <button className="Nav-signUp">Sign Up</button>
          <button className="Nav-signIn">Login</button>
            
          </div> */}

      {!isAuthenticated ? (
        <div className="nav-auth-buttons">
          <button
            className="Nav-signUp"
            onClick={() => navigate("/signup")}
          >
            Sign Up
          </button>

          <button
            className="Nav-signIn"
            onClick={() => navigate("/signin")}
          >
            Login
          </button>
        </div>
      ) : (
        <div className="header-user-controls">
          <div className="header-wallet-pill" title="Available coins">
            <FontAwesomeIcon icon={faCoins} className="header-wallet-icon" />
            <span className="header-wallet-value">{availableCoins.toLocaleString()}</span>
          </div>
          <div className="group" onClick={() => setProfileOpen(true)}>
            <span className="text-wrapper-8">{authUser.username ? authUser.username.charAt(0).toUpperCase() : "P"}</span>
            {/* <span className="header-username">{authUser.username}</span> */}
          </div>
        </div>
      )}

      {profileOpen && (
        <div className={`profile-overlay ${profileOpen ? "show" : ""}`}>
          <div className="profile-panel" ref={profileRef}>
            <div className="profile-header">
              <div className="profile-avata">P</div>
              <div>
                <h4>{authUser?.username || "Prime User"}</h4>
                <p>{authUser?.email || "prime@gaming.com"}</p>
              </div>
              <FontAwesomeIcon
                icon={faTimes}
                className="close-btn"
                onClick={() => setProfileOpen(false)}
              />
            </div>

            <ul className="profile-menu">
             
          
              <li
                onClick={() => {
                  navigate(isAdmin ? "/admin/payments" : "/player/dashboard");
                  setProfileOpen(false);
                }}
              >
                <FontAwesomeIcon icon={faUser} />
                {isAdmin ? "Admin Dashboard" : "Player Dashboard"}
              </li>

              <li className="logout" onClick={handleLogout}>
                <FontAwesomeIcon icon={faSignOutAlt} />
                Logout
              </li>
            </ul>
          </div>
        </div>
      )}


      <div className="mobile-icon" onClick={() => setMobileOpen(!mobileOpen)}>
        <FontAwesomeIcon icon={mobileOpen ? faTimes : faBars} />
      </div>


      {mobileOpen && (
        <div className="mobile-menu">
          <Link to="/" onClick={() => setMobileOpen(false)}>Home</Link>
          <Link to="/blogs" onClick={() => setMobileOpen(false)}>Blogs</Link>
          
          {/* <Link to="/pricing" onClick={() => setMobileOpen(false)}>Pricing</Link> */}

          <Link to="/leaderboard" onClick={() => setMobileOpen(false)}>Leaderboard</Link>

          {/* <Link to="/guides" onClick={() => setMobileOpen(false)}>Guides</Link> */}

          <Link to="/about" onClick={() => setMobileOpen(false)}>About Us</Link>
          <Link to="/contact" onClick={() => setMobileOpen(false)}>Contact Us</Link>
        </div>
      )}
    </header>
  );
};

export default Header;
