import React from 'react';

/**
 * @param {{ name: string, tagline: string, photoURL: string }} props
 */
export default function ProfileHeader({ name, tagline, photoURL }) {
  return (
    <section className="prf-hd" aria-label="Profile header">
      <div className="prf-hdIn" />
      <div className="prf-hdCrd">
        <div className="prf-ava" aria-hidden="true">
          {photoURL ? <img src={photoURL} alt="" /> : null}
        </div>
        <div className="prf-hdTxt">
          <h2 className="prf-nm">{name || 'Player'}</h2>
          <p className="prf-tag">{tagline || 'Player'}</p>
        </div>
      </div>
    </section>
  );
}

