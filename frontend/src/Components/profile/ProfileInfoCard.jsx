import React from 'react';
import { Pencil } from 'lucide-react';

/**
 * @param {{
 *  bio: string,
 *  fullName: string,
 *  mobile: string,
 *  email: string,
 *  cnic: string,
 *  location: string,
 *  onEditClick: () => void
 * }} props
 */
export default function ProfileInfoCard({
  bio,
  fullName,
  mobile,
  email,
  cnic,
  location,
  onEditClick,
}) {
  return (
    <section className="prf-crd" aria-labelledby="prf-info-title">
      <div className="prf-crdHd">
        <h3 className="prf-crdT" id="prf-info-title">
          Profile information
        </h3>
        <button type="button" className="prf-btn2" aria-label="Edit profile" onClick={onEditClick}>
          <Pencil size={18} />
        </button>
      </div>

      <p className="prf-bio">
        {bio ||
          "Hi, I'm here to play, compete, and improve. Keep your profile updated so friends can recognize you."}
      </p>

      <div className="prf-kv" role="list">
        <div className="prf-k" role="listitem">
          Full Name:
        </div>
        <div className="prf-v">{fullName || '—'}</div>

        <div className="prf-k" role="listitem">
          Mobile:
        </div>
        <div className="prf-v">{mobile || '—'}</div>

        <div className="prf-k" role="listitem">
          Email:
        </div>
        <div className="prf-v">{email || '—'}</div>

        <div className="prf-k" role="listitem">
          CNIC:
        </div>
        <div className="prf-v">{cnic || '—'}</div>

        <div className="prf-k" role="listitem">
          Location:
        </div>
        <div className="prf-v">{location || '—'}</div>
      </div>
    </section>
  );
}

