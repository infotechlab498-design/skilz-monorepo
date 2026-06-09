import { useState, useEffect } from "react";
import "./SignIn.css";
import Layout from "../Layout";
import { useNavigate, useLocation } from "react-router-dom";
import { VALIDATION_PATTERNS } from "../../utils/validators";
import {
  signInWithEmail,
  signInWithGoogleRedirect,
  signInWithFacebookRedirect,
  mapFirebaseAuthError,
  AuthLinkRequiredError,
  RegistrationRequiredError,
  signOutAppSession,
  hasPendingProviderLink,
  clearPendingProviderLink,
  describeSignInMethods,
  sendPasswordResetToEmail,
  requestDevConsoleOtp,
  verifyDevConsoleOtp,
  readPersistedLinkHint,
} from "../../services/authService.js";

const devOtpUiEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_CONSOLE_OTP === "true";

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState("");
  const [resetSending, setResetSending] = useState(false);
  /** @type {[{ email: string, methods: string[], attemptedProvider: string }] | null} */
  const [linkHint, setLinkHint] = useState(null);
  const [devOtpCode, setDevOtpCode] = useState("");
  const [devOtpBusy, setDevOtpBusy] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo || "/";

  const socialBusy = socialLoading !== "";

  useEffect(() => {
    if (!linkHint?.email) return;
    setEmail((prev) => (prev.trim() === "" ? linkHint.email : prev));
  }, [linkHint]);

  useEffect(() => {
    try {
      const n = sessionStorage.getItem("skilz_auth_notice");
      if (n) {
        setError(n);
        sessionStorage.removeItem("skilz_auth_notice");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const notice = location.state?.authNotice;
    if (typeof notice === "string" && notice.trim()) {
      setError(notice.trim());
    }
  }, [location.state]);

  useEffect(() => {
    const persisted = readPersistedLinkHint();
    if (!persisted) return;
    setLinkHint((prev) =>
      prev
        ? prev
        : {
            email: persisted.email,
            methods: persisted.methods,
            attemptedProvider: persisted.attemptedProvider,
          }
    );
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

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
      setLinkHint(null);
      clearPendingProviderLink();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof RegistrationRequiredError) {
        await signOutAppSession();
        navigate("/signup", { replace: true, state: { authNotice: err.userMessage } });
        return;
      }
      if (err instanceof AuthLinkRequiredError) {
        setLinkHint({
          email: err.email,
          methods: err.methods,
          attemptedProvider: err.attemptedProvider,
        });
        setError(err.userMessage);
      } else {
        setError(mapFirebaseAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setInfo("");
    setSocialLoading("google");
    try {
      setInfo("Redirecting to Google…");
      await signInWithGoogleRedirect(redirectTo);
      setLinkHint(null);
      clearPendingProviderLink();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setInfo("");
      if (err instanceof RegistrationRequiredError) {
        await signOutAppSession();
        navigate("/signup", { replace: true, state: { authNotice: err.userMessage } });
      } else if (err instanceof AuthLinkRequiredError) {
        setLinkHint({
          email: err.email,
          methods: err.methods,
          attemptedProvider: err.attemptedProvider,
        });
        setError(err.userMessage);
      } else {
        setError(mapFirebaseAuthError(err));
      }
    } finally {
      setSocialLoading("");
    }
  };

  const handleFacebookLogin = async () => {
    setError("");
    setInfo("");
    setSocialLoading("facebook");
    try {
      setInfo("Redirecting to Facebook…");
      await signInWithFacebookRedirect(redirectTo);
      setLinkHint(null);
      clearPendingProviderLink();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setInfo("");
      if (err instanceof RegistrationRequiredError) {
        await signOutAppSession();
        navigate("/signup", { replace: true, state: { authNotice: err.userMessage } });
      } else if (err instanceof AuthLinkRequiredError) {
        setLinkHint({
          email: err.email,
          methods: err.methods,
          attemptedProvider: err.attemptedProvider,
        });
        setError(err.userMessage);
      } else {
        setError(mapFirebaseAuthError(err));
      }
    } finally {
      setSocialLoading("");
    }
  };

  const handleDevOtpRequest = async () => {
    setError("");
    setInfo("");
    if (!email.trim() || !VALIDATION_PATTERNS.EMAIL.test(email.trim())) {
      setError("Enter a valid email above to receive a dev OTP.");
      return;
    }
    setDevOtpBusy("request");
    try {
      await requestDevConsoleOtp(email);
      setInfo(
        "Dev OTP sent. Check the server terminal (npm run dev) for the 6-digit code."
      );
    } catch (err) {
      setError(err?.message || "Could not request dev OTP.");
    } finally {
      setDevOtpBusy("");
    }
  };

  const handleDevOtpVerify = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim() || !VALIDATION_PATTERNS.EMAIL.test(email.trim())) {
      setError("Enter the same email as when you requested the OTP.");
      return;
    }
    if (!devOtpCode.trim()) {
      setError("Enter the 6-digit code from the server console.");
      return;
    }
    setDevOtpBusy("verify");
    try {
      await verifyDevConsoleOtp(email, devOtpCode);
      setLinkHint(null);
      clearPendingProviderLink();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err?.message || "Verification failed.");
    } finally {
      setDevOtpBusy("");
    }
  };

  const handleSendReset = async () => {
    setError("");
    setInfo("");
    if (!email.trim() || !VALIDATION_PATTERNS.EMAIL.test(email.trim())) {
      setError("Enter a valid email above to receive a reset link.");
      return;
    }
    setResetSending(true);
    try {
      await sendPasswordResetToEmail(email);
      setInfo(
        "If an account exists for this email, a password reset link has been sent."
      );
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setResetSending(false);
    }
  };

  const showLinkHelp =
    linkHint &&
    hasPendingProviderLink() &&
    linkHint.methods?.includes("password");

  return (
    <Layout>
      <div className="sign-in-page">
        <div className="sign-in-card">
          <h1 className="title">Log in</h1>

          {linkHint && (
            <div
              className="sign-in-link-banner"
              style={{
                marginBottom: 14,
                padding: "12px 14px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: 12,
                fontSize: 14,
                color: "#1e3a5f",
              }}
            >
              <strong>Account linking</strong>
              <p style={{ margin: "8px 0 0" }}>
                Registered with: {describeSignInMethods(linkHint.methods).join(", ")}.
              </p>
              {showLinkHelp && (
                <p style={{ margin: "8px 0 0" }}>
                  Enter your password below and sign in — we will link your{" "}
                  {linkHint.attemptedProvider === "google.com"
                    ? "Google"
                    : linkHint.attemptedProvider === "facebook.com"
                      ? "Facebook"
                      : "social"}{" "}
                  account.
                </p>
              )}
              {!showLinkHelp && (
                <p style={{ margin: "8px 0 0" }}>
                  Use the matching provider button above (
                  {describeSignInMethods(linkHint.methods).join(" or ")}) with{" "}
                  <strong>{linkHint.email}</strong>.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  clearPendingProviderLink();
                  setLinkHint(null);
                  setError("");
                }}
                style={{
                  marginTop: 10,
                  background: "transparent",
                  border: "none",
                  color: "#4f46e5",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Cancel linking
              </button>
            </div>
          )}

          <div className="social-login">
            <button
              className="social-btn google"
              type="button"
              onClick={() => void handleGoogleLogin()}
              disabled={socialBusy || loading}
            >
              {socialLoading === "google"
                ? "Connecting…"
                : "Continue with Google"}
            </button>

            <button
              className="social-btn facebook"
              type="button"
              onClick={() => void handleFacebookLogin()}
              disabled={socialBusy || loading}
            >
              {socialLoading === "facebook"
                ? "Connecting…"
                : "Continue with Facebook"}
            </button>
          </div>

          <div className="divider">
            <span>OR</span>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <div className="password-group">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <div className="options">
              <span />

              <span
                className="forgot"
                role="button"
                tabIndex={0}
                onClick={() => navigate("/forget-password")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate("/forget-password");
                  }
                }}
              >
                Forgot password?
              </span>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
              <button
                type="button"
                onClick={handleSendReset}
                disabled={resetSending || loading || socialBusy}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "#4f46e5",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "inherit",
                  textDecoration: "underline",
                }}
              >
                {resetSending ? "Sending link…" : "Email me a reset link"}
              </button>{" "}
              (uses Firebase email)
            </p>

            {error && <p className="error">{error}</p>}
            {info && (
              <p
                className="success"
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  color: "#166534",
                  fontSize: 13,
                  background: "#ecfdf3",
                  border: "1px solid #bbf7d0",
                  borderRadius: 10,
                }}
              >
                {info}
              </p>
            )}

            <button
              className="login-btn"
              type="submit"
              disabled={loading || socialBusy}
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>

          <div className="signup-redirect">
            <p>Don’t have an account?</p>
            <button
              className="signup-btn"
              type="button"
              onClick={() => navigate("/signup")}
            >
              Sign up
            </button>
          </div>

          {devOtpUiEnabled && (
            <details
              className="sign-in-dev-otp"
              style={{ marginTop: 20, fontSize: 13, color: "#64748b" }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                Developer sign-in (console OTP)
              </summary>
              <p style={{ margin: "10px 0 8px" }}>
                Requires{" "}
                <code style={{ fontSize: 12 }}>ENABLE_DEV_CONSOLE_OTP=1</code> on
                the server. OTP appears in the server console only.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  className="signup-btn"
                  disabled={!!devOtpBusy || loading || socialBusy}
                  onClick={() => void handleDevOtpRequest()}
                >
                  {devOtpBusy === "request"
                    ? "Requesting…"
                    : "Send OTP (check server console)"}
                </button>
                <form
                  onSubmit={(e) => void handleDevOtpVerify(e)}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={devOtpCode}
                    onChange={(e) =>
                      setDevOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    autoComplete="one-time-code"
                  />
                  <button
                    type="submit"
                    className="signup-btn"
                    disabled={!!devOtpBusy || loading || socialBusy}
                  >
                    {devOtpBusy === "verify" ? "Verifying…" : "Verify and sign in"}
                  </button>
                </form>
              </div>
            </details>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default SignIn;
