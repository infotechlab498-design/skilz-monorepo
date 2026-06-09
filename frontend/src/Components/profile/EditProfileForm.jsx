import React from 'react';
import { Camera } from 'lucide-react';

/**
 * @param {{
 *  value: Record<string, string>,
 *  errors: Record<string, string>,
 *  photoURL: string,
 *  saving: boolean,
 *  canSave: boolean,
 *  onChange: (key: string, val: string) => void,
 *  onPickImage: (file: File) => void,
 *  onSave: () => void,
 * }} props
 */
export default function EditProfileForm({
  open,
  value,
  errors,
  photoURL,
  saving,
  canSave,
  onChange,
  onPickImage,
  onSave,
  onClose,
}) {
  if (!open) return null;

  return (
    <section className="prf-crd prf-ed" aria-labelledby="prf-edit-title">
      <div className="prf-topEd">
        <h3 className="prf-crdT" id="prf-edit-title">
          Edit Profile
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="prf-btn" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button
            type="button"
            className="prf-btn prf-btn3"
            onClick={onSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="prf-avaEd">
        <div className="prf-avaLg" aria-hidden="true">
          {photoURL ? <img src={photoURL} alt="" /> : null}
        </div>
        <label className="prf-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Camera size={16} />
          Change Photo
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (f) onPickImage(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div style={{ height: 14 }} />

      <div className="prf-edGrid">
        <div>
          <label className="prf-lb" htmlFor="prf-name">
            Your Name
          </label>
          <input
            id="prf-name"
            className="prf-inp"
            value={value.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="Your name"
          />
          {errors.name ? <div className="prf-err">{errors.name}</div> : null}
        </div>

        <div>
          <label className="prf-lb" htmlFor="prf-username">
            User Name
          </label>
          <input
            id="prf-username"
            className="prf-inp"
            value={value.username}
            onChange={(e) => onChange('username', e.target.value)}
            placeholder="Username"
          />
          {errors.username ? <div className="prf-err">{errors.username}</div> : null}
        </div>

        <div>
          <label className="prf-lb" htmlFor="prf-email">
            Email
          </label>
          <input
            id="prf-email"
            className="prf-inp"
            value={value.email}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="you@example.com"
          />
          {errors.email ? <div className="prf-err">{errors.email}</div> : null}
        </div>

        <div>
          <label className="prf-lb" htmlFor="prf-phone">
            Phone
          </label>
          <input
            id="prf-phone"
            className="prf-inp"
            value={value.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="03XXXXXXXXX"
          />
          {errors.phone ? <div className="prf-err">{errors.phone}</div> : null}
        </div>

        <div>
          <label className="prf-lb" htmlFor="prf-dob">
            Date of Birth
          </label>
          <input
            id="prf-dob"
            className="prf-inp"
            value={value.dob}
            onChange={(e) => onChange('dob', e.target.value)}
            placeholder="YYYY-MM-DD"
          />
        </div>

        <div>
          <label className="prf-lb" htmlFor="prf-cnic">
            CNIC
          </label>
          <input
            id="prf-cnic"
            className="prf-inp"
            value={value.cnic}
            onChange={(e) => onChange('cnic', e.target.value)}
            placeholder="33105-92853-5"
          />
          {errors.cnic ? <div className="prf-err">{errors.cnic}</div> : null}
        </div>

        <div>
          <label className="prf-lb" htmlFor="prf-location">
            Location
          </label>
          <input
            id="prf-location"
            className="prf-inp"
            value={value.location}
            onChange={(e) => onChange('location', e.target.value)}
            placeholder="San Jose, California, USA"
          />
        </div>

        <div>
          <label className="prf-lb" htmlFor="prf-tagline">
            Tagline
          </label>
          <input
            id="prf-tagline"
            className="prf-inp"
            value={value.tagline}
            onChange={(e) => onChange('tagline', e.target.value)}
            placeholder="CEO / Player"
          />
        </div>

        <div className="prf-row2">
          <label className="prf-lb" htmlFor="prf-bio">
            Bio
          </label>
          <input
            id="prf-bio"
            className="prf-inp"
            value={value.bio}
            onChange={(e) => onChange('bio', e.target.value)}
            placeholder="A short profile description…"
          />
        </div>
      </div>
    </section>
  );
}

