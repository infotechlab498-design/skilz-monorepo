import React from 'react';
import FriendRow from './FriendRow.jsx';

export default function FriendsList({ friends, onInvite, title = 'Friends List', emptyMessage }) {
  const titleId = `friends-list-${String(title || 'list').replace(/\s+/g, '-').toLowerCase()}`;
  const empty = emptyMessage || 'No friends found yet.';
  return (
    <section className="frd-crd" aria-labelledby={titleId}>
      <h2 id={titleId} className="frd-ttl">{title}</h2>
      {friends.length === 0 ? (
        <div className="frd-empty">{empty}</div>
      ) : (
        <div className="frd-tblWrap">
          <table className="frd-tbl">
            <thead>
              <tr>
                <th>Players Name</th>
                <th>Activity Status</th>
                <th>Status</th>
                <th>Date</th>
                <th>Challenge</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {friends.map((f) => (
                <FriendRow key={f.uid} friend={f} onInvite={onInvite} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

