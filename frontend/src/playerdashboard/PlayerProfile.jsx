import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

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

import { validateCNIC, validateEmail, validatePhone } from '../utils/validators.js';
import { pakistanE164ToLocalDisplay, pakistanLocalToE164 } from '../utils/phoneE164.js';

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
  return {
    name,
    username: toStr(profile?.username),
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [profile, setProfile] = useState(null);
  const [photoURL, setPhotoURL] = useState('');
  const [form, setForm] = useState(() => buildInitialForm(null, authUser));
  const [errors, setErrors] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState(null);

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
      };
      const e164 = pakistanLocalToE164(form.phone);
      if (e164) patch.phoneE164 = e164;
      await updateUserProfile(uid, patch);
      setProfile((p) => ({ ...(p || {}), ...patch }));

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