import React, { useState } from "react";
import Layout from "../Layout";
import { useNavigate } from "react-router-dom";
import { validatePassword } from "../../utils/validators";

const SetNewPassword = () => {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

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
    setError(
      "Password reset is not fully configured yet. Use the Firebase email reset link flow until this page is wired to confirmPasswordReset."
    );
    setLoading(false);
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
            <form className="forget-pass-form" onSubmit={handleSubmit}>
              <input
                className="email-input-field"
                type="password"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                className="email-input-field"
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {error && <p className="error">{error}</p>}
              {success && <p className="success">{success}</p>}

              <button className="verify-form-button" type="submit" disabled={loading}>
                {loading ? "Updating..." : "Set Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SetNewPassword;