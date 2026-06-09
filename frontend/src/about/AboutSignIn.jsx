import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import googleIcon from "../assets/googleIcon.png";
import "./styles/aboutus.css";
import { VALIDATION_PATTERNS } from "../utils/validators";
import {
  signInWithEmail,
  signInWithGoogleRedirect,
  mapFirebaseAuthError,
  AuthLinkRequiredError,
  RegistrationRequiredError,
  signOutAppSession,
  sendPasswordResetToEmail,
} from "../services/authService.js";

function AboutSignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo || "/";
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);
  const authUser = useSelector((s) => s.auth.user);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    try {
      const n = sessionStorage.getItem("skilz_auth_notice");
      if (n) {
        setError(n);
        sessionStorage.removeItem("skilz_auth_notice");
      }
    } catch {
      // ignore storage access failures
    }
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setInfo("");
    const { email, password } = formData;
    if (!email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (!VALIDATION_PATTERNS.EMAIL.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      setSuccess("Signed in successfully.");
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof RegistrationRequiredError) {
        await signOutAppSession();
        navigate("/signup", { replace: true, state: { authNotice: err.userMessage } });
        return;
      }
      if (err instanceof AuthLinkRequiredError) {
        setError(err.userMessage);
      } else {
        setError(mapFirebaseAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setSuccess("");
    setInfo("");
    setSocialLoading(true);
    try {
      setInfo("Redirecting to Google...");
      await signInWithGoogleRedirect(redirectTo);
    } catch (err) {
      setInfo("");
      if (err instanceof RegistrationRequiredError) {
        await signOutAppSession();
        navigate("/signup", { replace: true, state: { authNotice: err.userMessage } });
        return;
      }
      if (err instanceof AuthLinkRequiredError) {
        setError(err.userMessage);
      } else {
        setError(mapFirebaseAuthError(err));
      }
    } finally {
      setSocialLoading(false);
    }
  };

  const handleSendReset = async () => {
    setError("");
    setSuccess("");
    setInfo("");
    if (!formData.email.trim() || !VALIDATION_PATTERNS.EMAIL.test(formData.email.trim())) {
      setError("Enter a valid email above to receive a reset link.");
      return;
    }
    setResetSending(true);
    try {
      await sendPasswordResetToEmail(formData.email);
      setInfo("If an account exists for this email, a password reset link has been sent.");
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setResetSending(false);
    }
  };

  const busy = loading || socialLoading || resetSending;

  if (!firebaseReady) {
    return (
      <div className="signin-card">
        <h3 className="signin-title">Sign In</h3>
        <p className="success-text">Checking session...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="signin-card">
        <h3 className="signin-title">You are signed in</h3>
        <p className="success-text">
          Welcome{authUser?.displayName ? `, ${authUser.displayName}` : ""}.
        </p>
        <div className="signin-form">
          <button
            type="button"
            className="signin-btn"
            onClick={() => navigate("/player/dashboard")}
          >
            Go to Dashboard
          </button>
          <button
            type="button"
            className="google-btn"
            onClick={() => navigate("/")}
          >
            Continue Browsing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="signin-card">
      <h3 className="signin-title">Sign In</h3>

      <form className="signin-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            value={formData.email}
            onChange={handleChange}
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            name="password"
            placeholder="Enter your password"
            value={formData.password}
            onChange={handleChange}
            autoComplete="current-password"
          />
        </div>

        <button type="button" className="signin-link-btn" onClick={handleSendReset} disabled={busy}>
          {resetSending ? "Sending reset link..." : "Forgot password? Email me a reset link"}
        </button>

        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}
        {info && <p className="success-text">{info}</p>}

        <button type="submit" className="signin-btn" disabled={busy}>
          {loading ? "Signing In..." : "Sign In"}
        </button>

        <div className="divider">
          <span>OR</span>
        </div>

        <button
          type="button"
          className="google-btn"
          onClick={handleGoogleSignIn}
          disabled={busy}
        >
          <img src={googleIcon} alt="Google" />
          {socialLoading ? "Connecting..." : "Continue with Google"}
        </button>

        <button
          type="button"
          className="signin-link-btn"
          onClick={() => navigate("/signin", { state: { redirectTo } })}
        >
          Open full sign-in options
        </button>
      </form>
    </div>
  );
}

export default AboutSignIn;
