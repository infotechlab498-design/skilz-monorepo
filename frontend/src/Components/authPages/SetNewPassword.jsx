import { useState, useEffect } from 'react';
import Layout from '../Layout';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { validatePassword } from '../../utils/validators';
import {
  confirmPasswordResetWithCode,
  mapFirebaseAuthError,
} from '../../services/authService.js';

const SetNewPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const oobCode = searchParams.get('oobCode') || searchParams.get('code') || '';
  const mode = searchParams.get('mode') || '';

  useEffect(() => {
    if (!oobCode) {
      setError(
        'Invalid or missing reset link. Open the link from your email, or request a new reset from Forgot password.'
      );
    } else if (mode && mode !== 'resetPassword') {
      setError('This link is not a password reset link. Use Forgot password to request a new one.');
    }
  }, [oobCode, mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!oobCode) {
      setError('Reset link is missing or expired. Request a new reset email.');
      return;
    }

    if (!password || !confirmPassword) {
      setError('Both fields are required');
      return;
    }

    if (!validatePassword(password)) {
      setError('Password must be at least 8 characters and include letters & numbers');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordResetWithCode(oobCode, password);
      setSuccess('Password updated. You can sign in with your new password.');
      setTimeout(() => navigate('/signin', { replace: true }), 2000);
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
              Enter your new password below. This page completes the reset link from your email.
            </p>
          </div>

          <div className="frame-2">
            <form className="forget-pass-form" onSubmit={(e) => void handleSubmit(e)}>
              <input
                className="email-input-field"
                type="password"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={!oobCode || loading}
              />
              <input
                className="email-input-field"
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={!oobCode || loading}
              />
              {error && <p className="error">{error}</p>}
              {success && <p className="success">{success}</p>}

              <button
                className="verify-form-button"
                type="submit"
                disabled={!oobCode || loading}
              >
                {loading ? 'Updating…' : 'Set Password'}
              </button>
            </form>

            <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px' }}>
              <Link to="/forget-password">Request a new reset link</Link>
              {' · '}
              <Link to="/signin">Back to sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SetNewPassword;
