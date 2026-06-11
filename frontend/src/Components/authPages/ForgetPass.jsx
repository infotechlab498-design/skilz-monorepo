import { useState } from "react";
import Layout from "../Layout";
import "./forgetPass.css";
import { Link } from "react-router-dom";
import { Mail, Send, ArrowLeft, ShieldCheck } from "lucide-react";
import { validateEmail } from "../../utils/validators";
import { sendPasswordResetToEmail, mapFirebaseAuthError } from "../../services/authService.js";

function ForgetPassIllustration() {
  return (
    <svg
      className="fp-illustration-svg"
      viewBox="0 0 280 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <ellipse cx="48" cy="118" rx="28" ry="10" fill="#E9D5FF" opacity="0.6" />
      <path
        d="M28 95C28 95 32 72 48 68C64 64 72 88 72 88"
        stroke="#C4B5FD"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M18 100C18 100 14 78 30 74"
        stroke="#DDD6FE"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="72" y="52" width="136" height="88" rx="12" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />
      <path d="M72 64L140 108L208 64" fill="#EDE9FE" stroke="#C4B5FD" strokeWidth="2" strokeLinejoin="round" />
      <rect x="108" y="78" width="64" height="44" rx="8" fill="#fff" stroke="#E2E8F0" strokeWidth="1.5" />
      <rect x="128" y="92" width="24" height="20" rx="4" fill="#6366F1" />
      <path
        d="M140 88V96"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="140" cy="102" r="3" fill="#fff" />
      <path
        d="M218 48L248 38L238 68L218 48Z"
        fill="#6366F1"
      />
      <path
        d="M218 48L248 38"
        stroke="#818CF8"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="230" cy="32" r="6" fill="#A5B4FC" opacity="0.7" />
      <circle cx="252" cy="58" r="4" fill="#C7D2FE" opacity="0.8" />
      <circle cx="200" cy="42" r="5" fill="#DDD6FE" opacity="0.6" />
    </svg>
  );
}

const ForgetPass = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetToEmail(email);
      setSuccess(
        "If an account exists for this email, we sent a secure reset link. Check your inbox and spam folder."
      );
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout hideSiteChrome>
      <div className="fp-page">
        <div className="fp-bg-blob fp-bg-blob--tl" aria-hidden />
        <div className="fp-bg-blob fp-bg-blob--br" aria-hidden />
        <div className="fp-bg-dots fp-bg-dots--left" aria-hidden />
        <div className="fp-bg-dots fp-bg-dots--right" aria-hidden />
        <div className="fp-bg-arc fp-bg-arc--1" aria-hidden />
        <div className="fp-bg-arc fp-bg-arc--2" aria-hidden />

        <div className="fp-card">
          <p className="fp-logo" aria-label="Logo">
            <span className="fp-logo-lo">LO</span>
            <span className="fp-logo-go">GO</span>
          </p>

          <div className="fp-illustration-wrap">
            <ForgetPassIllustration />
          </div>

          <h1 className="fp-title">Reset your password</h1>
          <p className="fp-subtitle">
            Enter your email address and we&apos;ll send you a secure link to reset your
            password.
          </p>

          <form className="fp-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
            <label className="fp-label" htmlFor="fp-email">
              Email address
            </label>
            <div className={`fp-input-wrap${error ? " fp-input-wrap--error" : ""}`}>
              <Mail className="fp-input-icon" size={18} strokeWidth={2} aria-hidden />
              <input
                id="fp-email"
                className="fp-input"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
              />
            </div>

            {error && (
              <p className="fp-message fp-message--error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="fp-message fp-message--success" role="status">
                {success}
              </p>
            )}

            <button className="fp-submit" type="submit" disabled={loading}>
              <Send className="fp-submit-icon" size={18} strokeWidth={2.25} aria-hidden />
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <div className="fp-divider" aria-hidden>
            <span>or</span>
          </div>

          <Link to="/signin" className="fp-back-link">
            <ArrowLeft size={16} strokeWidth={2.25} aria-hidden />
            Back to sign in
          </Link>

          <div className="fp-security">
            <div className="fp-security-icon" aria-hidden>
              <ShieldCheck size={18} strokeWidth={2} />
            </div>
            <p className="fp-security-text">
              <strong>Your security is important to us.</strong> We&apos;ll never share your
              email with anyone.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ForgetPass;
