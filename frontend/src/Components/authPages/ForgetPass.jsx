import { useState } from "react";
import Layout from "../Layout";
import "./forgetPass.css";
import { Link } from "react-router-dom";
import { validateEmail } from "../../utils/validators";
import { sendPasswordResetToEmail, mapFirebaseAuthError } from "../../services/authService.js";

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
        "If an account exists for this email, we sent a reset link. Check your inbox and spam folder."
      );
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="verify-Container">
        <div className="sub-verify-Container">
          <div className="password">
            <p className="LOGOText">
              <span className="text-wrapper">LO</span>
              <span className="span">GO</span>
            </p>
            <div className="text-wrappe-2">Reset password</div>
            <p className="forget-pass-text">
              Enter your email. We will send a link to reset your password (Firebase
              email template).
            </p>
          </div>

          <div className="frame-2">
            <form className="forget-pass-form" onSubmit={handleSubmit}>
              <input
                className="email-input-field"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {error && <p className="error">{error}</p>}
              {success && <p className="success">{success}</p>}
              <button className="verify-form-button" type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p style={{ marginTop: "16px", textAlign: "center", fontSize: "14px" }}>
              <Link to="/signin">Back to sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ForgetPass;
