import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';

import '../Components/profile/profile.css';
import '../Components/chat/chat.css';
import ProfileHeader from '../Components/profile/ProfileHeader.jsx';
import ProfileInfoCard from '../Components/profile/ProfileInfoCard.jsx';
import MessagesCard from '../Components/profile/MessagesCard.jsx';
import EditProfileForm from '../Components/profile/EditProfileForm.jsx';
import DirectMessageModal from '../Components/chat/DirectMessageModal.jsx';

import {
  getUserProfile,
  updateUserProfile,
  uploadProfileImage,
} from '../api/userApi.js';
import { upsertPublicProfile } from '../api/profileApi.js';
import { syncAuthUserFromFirestoreProfile } from '../services/authService.js';

import { validateCNIC, validateEmail, validatePhone } from '../utils/validators.js';
import { pakistanE164ToLocalDisplay, pakistanLocalToE164 } from '../utils/phoneE164.js';
import {
  isProfileBasicComplete,
  isProfileBillingComplete,
  resolveProfileComplete,
  suggestUsernameFromIdentity,
} from '../utils/profileCompletion.js';

function toStr(v) {
  return String(v ?? '').trim();
}

function buildInitialForm(profile, authUser) {
  const name =
    toStr(profile?.fullName) ||
    toStr(profile?.name) ||
    toStr(profile?.displayName) ||
    toStr(authUser?.displayName);
  const email = toStr(profile?.email) || toStr(authUser?.email);
  const phoneRaw = toStr(profile?.phoneLocal) || toStr(profile?.phone);
  const phone = pakistanE164ToLocalDisplay(phoneRaw) || phoneRaw;
  const username =
    toStr(profile?.username) ||
    suggestUsernameFromIdentity({
      uid: profile?.uid || authUser?.uid,
      email,
      displayName: name || authUser?.displayName,
    });
  return {
    name,
    username,
    email,
    phone,
    dob: toStr(profile?.dob),
    cnic: toStr(profile?.cnic),
    location: toStr(profile?.location),
    tagline: toStr(profile?.tagline),
    bio: toStr(profile?.bio),
  };
}

function validateForm(form) {
  /** @type {Record<string, string>} */
  const errors = {};
  const name = toStr(form.name);
  const username = toStr(form.username);
  const email = toStr(form.email);
  const phone = toStr(form.phone);
  const cnic = toStr(form.cnic);

  if (!name) errors.name = 'Name is required';
  if (!username) errors.username = 'Username is required';
  if (!email) errors.email = 'Email is required';
  else if (!validateEmail(email)) errors.email = 'Enter a valid email';

  if (phone && !validatePhone(phone)) errors.phone = 'Use 03XXXXXXXXX';
  if (cnic && !validateCNIC(cnic)) errors.cnic = 'Use 33105-92853-5';

  return errors;
}

export default function PlayerProfile() {
  const authUser = useSelector((s) => s.auth.user);
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const uid = authUser?.uid || null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const completeMode = searchParams.get('complete');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completionDismissed, setCompletionDismissed] = useState(false);

  const [profile, setProfile] = useState(null);
  const [photoURL, setPhotoURL] = useState('');
  const [form, setForm] = useState(() => buildInitialForm(null, authUser));
  const [errors, setErrors] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState(null);

  const profileComplete = useMemo(
    () => resolveProfileComplete(profile),
    [profile]
  );

  const showCompletionBanner = useMemo(() => {
    if (completionDismissed) return false;
    if (completeMode === 'billing' && !isProfileBillingComplete(profile)) return true;
    if (completeMode === '1' || completeMode === 'true') return !profileComplete;
    return !profileComplete;
  }, [completionDismissed, completeMode, profile, profileComplete]);

  const completionBannerText = useMemo(() => {
    if (completeMode === 'billing') {
      return 'Add your phone number and CNIC to unlock coin purchases and billing.';
    }
    return 'Welcome! Your social account is connected. Confirm your username and add phone/CNIC when you are ready.';
  }, [completeMode]);

  const canSave = useMemo(() => {
    const e = validateForm(form);
    return Object.keys(e).length === 0 && !saving;
  }, [form, saving]);

  const displayName = useMemo(() => {
    return (
      toStr(form.name) ||
      toStr(profile?.fullName) ||
      toStr(profile?.name) ||
      toStr(profile?.displayName) ||
      'Player'
    );
  }, [form.name, profile]);

  const tagline = useMemo(() => toStr(form.tagline) || toStr(profile?.tagline) || 'Player', [form.tagline, profile]);

  const refresh = useCallback(async () => {
    if (!uid) {
      setProfile(null);
      setPhotoURL('');
      setForm(buildInitialForm(null, authUser));
      setErrors({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const p = await getUserProfile(uid);
      setProfile(p);
      const nextPhoto = toStr(p?.profileImage) || toStr(p?.photoURL) || toStr(authUser?.photoURL);
      setPhotoURL(nextPhoto);
      const nextForm = buildInitialForm(p, authUser);
      setForm(nextForm);
      setErrors(validateForm(nextForm));
    } catch (e) {
       
      console.error('[PlayerProfile] load', e);
      setError(e?.message || 'Could not load profile.');
    } finally {
      setLoading(false);
    }
  }, [uid, authUser]);

  useEffect(() => {
    if (!firebaseReady) return;
    void refresh();
  }, [firebaseReady, refresh]);

  useEffect(() => {
    if (!firebaseReady || loading) return;
    if (completeMode === '1' || completeMode === 'true' || completeMode === 'billing') {
      setEditOpen(true);
    }
  }, [firebaseReady, loading, completeMode]);

  const onChange = useCallback((key, val) => {
    setForm((f) => {
      const next = { ...f, [key]: val };
      setErrors(validateForm(next));
      return next;
    });
  }, []);

  const onPickImage = useCallback(
    async (file) => {
      if (!uid) return;
      setError('');
      try {
        setSaving(true);
        const uploaded = await uploadProfileImage(file);
        setPhotoURL(uploaded.url);
        setProfile((p) => ({ ...(p || {}), profileImage: uploaded.url, photoURL: uploaded.url }));
        await upsertPublicProfile(uid, {
          displayName,
          photoURL: uploaded.url,
          level: Number(profile?.level ?? 1),
          xp: Number(profile?.xp ?? 0),
        });
      } catch (e) {
        console.error('[PlayerProfile] upload photo', e);
        setError(e?.message || 'Could not upload profile image.');
      } finally {
        setSaving(false);
      }
    },
    [uid, displayName, profile]
  );

  const onSave = useCallback(async () => {
    if (!uid) return;
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setError('');
    try {
      const patch = {
        fullName: toStr(form.name),
        name: toStr(form.name),
        username: toStr(form.username),
        email: toStr(form.email),
        phone: toStr(form.phone),
        phoneLocal: toStr(form.phone),
        dob: toStr(form.dob),
        cnic: toStr(form.cnic),
        location: toStr(form.location),
        tagline: toStr(form.tagline),
        bio: toStr(form.bio),
        displayName: toStr(form.name) || toStr(profile?.displayName) || toStr(authUser?.displayName) || 'Player',
        photoURL: photoURL || toStr(profile?.photoURL) || toStr(authUser?.photoURL) || '',
      };
      const e164 = pakistanLocalToE164(form.phone);
      if (e164) patch.phoneE164 = e164;
      const mergedForComplete = { ...(profile || {}), ...patch };
      patch.profileComplete = isProfileBasicComplete(mergedForComplete);
      await updateUserProfile(uid, patch);
      setProfile((p) => ({ ...(p || {}), ...patch }));
      syncAuthUserFromFirestoreProfile(uid);

      if (patch.profileComplete) {
        setCompletionDismissed(true);
        setEditOpen(false);
      } else if (isProfileBillingComplete(mergedForComplete)) {
        setCompletionDismissed(true);
      }

      // Security/compatibility: mirror safe fields for cross-user reads
      await upsertPublicProfile(uid, {
        displayName: patch.displayName,
        photoURL: patch.photoURL,
        level: Number((profile?.level ?? 1)),
        xp: Number((profile?.xp ?? 0)),
      });
    } catch (e) {
       
      console.error('[PlayerProfile] save', e);
      setError(e?.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }, [uid, form, photoURL, profile, authUser]);

  const jumpToEdit = useCallback(() => {
    try {
      setEditOpen(true);
      const el = document.getElementById('prf-edit-title');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      /* ignore */
    }
  }, []);

  const closeEdit = useCallback(() => {
    if (saving) return;
    setEditOpen(false);
  }, [saving]);

  const openReplyChat = useCallback((player) => {
    if (!player?.uid) return;
    setChatTarget(player);
    setChatOpen(true);
  }, []);

  const closeReplyChat = useCallback(() => {
    setChatOpen(false);
    setChatTarget(null);
  }, []);

  if (!firebaseReady) {
    return (
      <div className="prf-c">
        <div className="prf-crm">
          Pages / <span>Profile</span>
        </div>
        <h1 className="prf-ttl">Profile</h1>
        <div className="prf-al prf-alI" role="status" aria-live="polite">Loading session…</div>
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="prf-c">
        <div className="prf-crm">
          Pages / <span>Profile</span>
        </div>
        <h1 className="prf-ttl">Profile</h1>
        <div className="prf-al prf-alI">Sign in to view and edit your profile.</div>
      </div>
    );
  }

  return (
    <div className="prf-c">
      <div className="prf-crm">
        Pages / <span>Profile</span>
      </div>
      <h1 className="prf-ttl">Profile</h1>

      {showCompletionBanner ? (
        <div
          className="prf-al"
          role="status"
          style={{
            marginBottom: 16,
            padding: '14px 16px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 12,
            color: '#1e3a5f',
          }}
        >
          <strong>Complete your profile</strong>
          <p style={{ margin: '8px 0 12px', fontSize: 14 }}>{completionBannerText}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              className="signup-btn"
              style={{ margin: 0 }}
              onClick={jumpToEdit}
            >
              Complete now
            </button>
            <button
              type="button"
              className="signup-btn"
              style={{ margin: 0, background: '#64748b' }}
              onClick={() => navigate('/')}
            >
              Play games anyway
            </button>
            <button
              type="button"
              style={{
                margin: 0,
                background: 'transparent',
                border: 'none',
                color: '#4f46e5',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
              onClick={() => setCompletionDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="prf-al prf-alE" role="status" aria-live="polite">{error}</div> : null}

      <ProfileHeader name={displayName} tagline={tagline} photoURL={photoURL} />

      <div className="prf-mid">
        <ProfileInfoCard
          bio={toStr(profile?.bio) || toStr(form.bio)}
          fullName={displayName}
          mobile={toStr(form.phone) || toStr(profile?.phone)}
          email={toStr(form.email) || toStr(profile?.email)}
          cnic={toStr(form.cnic) || toStr(profile?.cnic)}
          location={toStr(form.location) || toStr(profile?.location)}
          onEditClick={jumpToEdit}
        />
        <MessagesCard onReply={openReplyChat} />
      </div>
      <div className="prf-al" style={{ marginTop: 12 }}>
        <strong>Syllogism Progress:</strong>{' '}
        {`Matches ${Number(profile?.stats?.syllogismMatches || 0)} | Wins ${Number(profile?.stats?.syllogismWins || 0)} | XP ${Number(profile?.xp || 0)} | Rank ${String(profile?.rank || 'Bronze')}`}
      </div>

      <EditProfileForm
        open={editOpen}
        value={form}
        errors={errors}
        photoURL={photoURL}
        saving={saving || loading}
        canSave={canSave}
        onChange={onChange}
        onPickImage={onPickImage}
        onSave={onSave}
        onClose={closeEdit}
      />

      <DirectMessageModal
        open={chatOpen}
        onClose={closeReplyChat}
        currentUid={uid}
        currentName={displayName}
        target={chatTarget}
      />
    </div>
  );
}