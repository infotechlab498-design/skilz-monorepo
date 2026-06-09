import React from 'react';

export default function StatusBadge({ online }) {
  return <span className={`frd-bdg ${online ? 'is-on' : 'is-off'}`}>{online ? 'ONLINE' : 'OFFLINE'}</span>;
}

