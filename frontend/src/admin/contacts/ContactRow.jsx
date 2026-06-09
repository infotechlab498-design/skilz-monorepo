import React from 'react';
import { Eye, Archive } from 'lucide-react';

function formatShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function initials(first, last) {
  const a = String(first || '').trim().charAt(0);
  const b = String(last || '').trim().charAt(0);
  const s = (a + b).toUpperCase();
  return s || '?';
}

function previewText(text, max = 72) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default function ContactRow({ message, onOpen, onQuickArchive }) {
  const name = `${message.firstName || ''} ${message.lastName || ''}`.trim() || '—';
  const ini = initials(message.firstName, message.lastName);
  const st = String(message.status || 'new').toLowerCase();

  return (
    <tr className="contactAdmin-row">
      <td className="contactAdmin-td contactAdmin-td--user">
        <div className="contactAdmin-userCell">
          <span className="contactAdmin-avatar" aria-hidden>
            {ini}
          </span>
          <div>
            <div className="contactAdmin-userName">{name}</div>
            <div className="contactAdmin-userEmail">{message.email || '—'}</div>
          </div>
        </div>
      </td>
      <td className="contactAdmin-td contactAdmin-td--preview">
        <span className="contactAdmin-previewText">{previewText(message.message)}</span>
      </td>
      <td className="contactAdmin-td">
        <span className={`contactAdmin-pill contactAdmin-pill--${st}`}>{(message.status || 'new').toUpperCase()}</span>
      </td>
      <td className="contactAdmin-td contactAdmin-td--date">{formatShort(message.createdAt)}</td>
      <td className="contactAdmin-td contactAdmin-td--actions">
        <div className="contactAdmin-actionBtns">
          <button
            type="button"
            className="contactAdmin-actionBtn"
            title="View details"
            aria-label={`View inquiry from ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(message);
            }}
          >
            <Eye size={18} strokeWidth={2} aria-hidden />
            <span className="contactAdmin-actionBtnLabel">View</span>
          </button>
          <button
            type="button"
            className="contactAdmin-actionBtn"
            title="Archive inquiry"
            aria-label={`Archive inquiry from ${name}`}
            disabled={st === 'archived'}
            onClick={(e) => {
              e.stopPropagation();
              onQuickArchive(message);
            }}
          >
            <Archive size={18} strokeWidth={2} aria-hidden />
            <span className="contactAdmin-actionBtnLabel">Archive</span>
          </button>
        </div>
      </td>
    </tr>
  );
}
