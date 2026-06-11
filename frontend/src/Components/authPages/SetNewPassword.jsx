import React, { useMemo, useState } from "react";
import Layout from "../Layout";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { validatePassword } from "../../utils/validators";
import {
  confirmPasswordResetWithCode,
  mapFirebaseAuthError,
} from "../../services/authService.js";

const SetNewPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const oobCode = useMemo(() => searchParams.get("oobCode") || "", [searchParams]);
  const mode = useMemo(() => searchParams.get("mode") || "", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const linkInvalid = !oobCode || (mode && mode !== "resetPassword");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (linkInvalid) {
      setError("This reset link is invalid or expired. Request a new one from the sign-in page.");
      return;
    }

    if (!password || !confirmPassword) {
      setError("Both fields are required");
      return;
    }

    if (!validatePassword(password)) {
      setError("Password must be at least 8 characters and include letters & numbers");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordResetWithCode(oobCode, password);
      setSuccess("Password updated. You can sign in with your new password.");
      setTimeout(() => navigate("/signin", { replace: true }), 1500);
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
            <div className="text-wrapper-2">Set New Password</div>
            <p className="forget-pass-text">
              Enter your new password below and confirm it.
            </p>
          </div>

          <div className="frame-2">
            {linkInvalid ? (
              <>
                <p className="error">
                  This reset link is invalid or has expired. Use Forgot password on the sign-in
                  page to receive a new email.
                </p>
                <p style={{ marginTop: 16, textAlign: "center", fontSize: 14 }}>
                  <Link to="/signin">Back to sign in</Link>
                </p>
              </>
            ) : (
              <form className="forget-pass-form" onSubmit={(e) => void handleSubmit(e)}>
                <input
                  className="email-input-field"
                  type="password"
                  placeholder="New Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <input
                  className="email-input-field"
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {error && <p className="error">{error}</p>}
                {success && <p className="success">{success}</p>}

                <button className="verify-form-button" type="submit" disabled={loading}>
                  {loading ? "Updating…" : "Set Password"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SetNewPassword;
