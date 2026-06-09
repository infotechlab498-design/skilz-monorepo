import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Eye, EyeOff } from 'lucide-react';
import { auth } from '../firebase/config.js';
import { validatePassword } from '../utils/validators.js';
import {
  changeCurrentUserPassword,
  markPasswordUpdated,
} from '../api/changePasswordApi.js';
import '../Components/changePassword/plChangePassword.css';

function initialForm() {
  return {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };
}

function validate(form) {
  /** @type {Record<string, string>} */
  const e = {};
  const cur = String(form.currentPassword || '');
  const next = String(form.newPassword || '');
  const cfm = String(form.confirmPassword || '');

  if (!cur) e.currentPassword = 'Current password is required.';
  if (!next) e.newPassword = 'New password is required.';
  else if (!validatePassword(next)) {
    e.newPassword = 'Use at least 8 characters with at least one letter and one number.';
  }
  if (!cfm) e.confirmPassword = 'Confirm your new password.';
  else if (cfm !== next) e.confirmPassword = 'Passwords do not match.';
  if (cur && next && cur === next) e.newPassword = 'New password must be different.';
  return e;
}

export default function PlChangePassword() {
  const reduxUser = useSelector((s) => s.auth.user);
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const uid = reduxUser?.uid || null;

  const [phase, setPhase] = useState(/** @type {'edit' | 'confirm'} */ ('edit'));
  const [confirmText, setConfirmText] = useState('');

  const [form, setForm] = useState(initialForm);
  const [show, setShow] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const errors = useMemo(() => validate(form), [form]);
  const canSubmit = useMemo(
    () => !submitting && Object.keys(errors).length === 0,
    [errors, submitting]
  );

  const displayEmail =
    auth.currentUser?.email || reduxUser?.email || '(no email on session)';
  const displayUid = uid ? `${uid.slice(0, 8)}…` : '—';

  const confirmTokenOk = confirmText.trim() === 'CONFIRM';

  function onChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setSuccess('');
  }

  function goBackToEdit() {
    setPhase('edit');
    setConfirmText('');
    setError('');
  }

  async function executePasswordChange() {
    if (!uid || !firebaseReady) return;
    const authUid = auth.currentUser?.uid || null;
    if (!authUid || authUid !== uid) {
      setError('Session mismatch. Please sign in again and retry.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const r = await changeCurrentUserPassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      if (!r.ok) {
        setError(r.message || 'Could not update password.');
        return;
      }

      setPhase('edit');
      setConfirmText('');
      setForm(initialForm());
      setShow({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });

      try {
        await markPasswordUpdated(uid);
        setSuccess('Password updated successfully.');
      } catch {
        setSuccess(
          'Your password was updated. Your profile timestamp could not be saved; you can ignore this or try again later.'
        );
      }
    } catch (err) {
      setError(err?.message || 'Could not update password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!uid || !firebaseReady) return;

    if (phase === 'edit') {
      if (!canSubmit) return;
      const authUid = auth.currentUser?.uid || null;
      if (!authUid || authUid !== uid) {
        setError('Session mismatch. Please sign in again and retry.');
        return;
      }
      setConfirmText('');
      setError('');
      setSuccess('');
      setPhase('confirm');
      return;
    }

    if (phase === 'confirm') {
      if (!confirmTokenOk) {
        setError('Type CONFIRM exactly to proceed, or use Back to edit.');
        return;
      }
      await executePasswordChange();
    }
  }

  if (!firebaseReady) {
    return (
      <section className="pcp-wrap">
        <div className="pcp-crumb">Pages / <span>Change Password</span></div>
        <div className="pcp-box">
          <h1 className="pcp-title">New Password</h1>
          <p className="pcp-sub">Loading your session…</p>
        </div>
      </section>
    );
  }

  if (!uid) {
    return (
      <section className="pcp-wrap">
        <div className="pcp-crumb">Pages / <span>Change Password</span></div>
        <div className="pcp-box">
          <h1 className="pcp-title">New Password</h1>
          <p className="pcp-sub">Sign in to change your password.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="pcp-wrap">
      <div className="pcp-crumb">Pages / <span>Change Password</span></div>

      <form className="pcp-box" onSubmit={onSubmit} noValidate>
        <h1 className="pcp-title">New Password</h1>
        <p className="pcp-sub">
          Set the new password for your account so you can login and access all features.
        </p>

        {error ? <div className="pcp-alert pcp-alert--err">{error}</div> : null}
        {success ? <div className="pcp-alert pcp-alert--ok">{success}</div> : null}

        <div className="pcp-field">
          <label className="pcp-lbl" htmlFor="pcp-current">
            Current password
          </label>
          <div className="pcp-inputWrap">
            <input
              id="pcp-current"
              className="pcp-inp"
              type={show.currentPassword ? 'text' : 'password'}
              placeholder="Enter your current password"
              value={form.currentPassword}
              onChange={(e) => onChange('currentPassword', e.target.value)}
              autoComplete="current-password"
              disabled={phase === 'confirm'}
            />
            <button
              type="button"
              className="pcp-eye"
              disabled={phase === 'confirm'}
              onClick={() =>
                setShow((s) => ({ ...s, currentPassword: !s.currentPassword }))
              }
              aria-label="Toggle current password visibility"
            >
              {show.currentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.currentPassword ? (
            <p className="pcp-err">{errors.currentPassword}</p>
          ) : null}
        </div>

        <div className="pcp-field">
          <label className="pcp-lbl" htmlFor="pcp-new">
            Enter new password
          </label>
          <div className="pcp-inputWrap">
            <input
              id="pcp-new"
              className="pcp-inp"
              type={show.newPassword ? 'text' : 'password'}
              placeholder="8 symbols at least"
              value={form.newPassword}
              onChange={(e) => onChange('newPassword', e.target.value)}
              autoComplete="new-password"
              disabled={phase === 'confirm'}
            />
            <button
              type="button"
              className="pcp-eye"
              disabled={phase === 'confirm'}
              onClick={() => setShow((s) => ({ ...s, newPassword: !s.newPassword }))}
              aria-label="Toggle new password visibility"
            >
              {show.newPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.newPassword ? <p className="pcp-err">{errors.newPassword}</p> : null}
        </div>

        <div className="pcp-field">
          <label className="pcp-lbl" htmlFor="pcp-confirm">
            Confirm password
          </label>
          <div className="pcp-inputWrap">
            <input
              id="pcp-confirm"
              className="pcp-inp"
              type={show.confirmPassword ? 'text' : 'password'}
              placeholder="8 symbols at least"
              value={form.confirmPassword}
              onChange={(e) => onChange('confirmPassword', e.target.value)}
              autoComplete="new-password"
              disabled={phase === 'confirm'}
            />
            <button
              type="button"
              className="pcp-eye"
              disabled={phase === 'confirm'}
              onClick={() =>
                setShow((s) => ({ ...s, confirmPassword: !s.confirmPassword }))
              }
              aria-label="Toggle confirm password visibility"
            >
              {show.confirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.confirmPassword ? (
            <p className="pcp-err">{errors.confirmPassword}</p>
          ) : null}
        </div>

        {phase === 'confirm' ? (
          <div className="pcp-confirm" role="region" aria-label="Confirmation required">
            <p className="pcp-confirmTitle">Confirmation required</p>
            <pre className="pcp-confirmBox">
              {`Action: Change Firebase Auth password and update profile timestamps
User: ${displayEmail}
Account: ${displayUid}
Target: Firebase Authentication + Firestore user profile (updatedAt, passwordUpdatedAt)
Impact: You must sign in with the new password afterward. Other devices may need to sign in again.`}
            </pre>
            <p className="pcp-confirmHint">
              Type <strong>CONFIRM</strong> to proceed, or <strong>Back</strong> to edit fields.
            </p>
            <div className="pcp-field">
              <label className="pcp-lbl" htmlFor="pcp-confirm-token">
                Confirmation
              </label>
              <input
                id="pcp-confirm-token"
                className="pcp-inp pcp-inp--confirm"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                  setError('');
                }}
                placeholder="CONFIRM"
              />
            </div>
          </div>
        ) : null}

        <div className="pcp-actions">
          {phase === 'confirm' ? (
            <button
              type="button"
              className="pcp-btn pcp-btn--secondary"
              disabled={submitting}
              onClick={goBackToEdit}
            >
              Back
            </button>
          ) : null}
          <button
            type="submit"
            className="pcp-btn"
            disabled={phase === 'edit' ? !canSubmit : submitting || !confirmTokenOk}
          >
            {submitting
              ? 'UPDATING…'
              : phase === 'edit'
                ? 'Continue to confirmation'
                : 'Confirm and update password'}
          </button>
        </div>
      </form>
    </section>
  );
}