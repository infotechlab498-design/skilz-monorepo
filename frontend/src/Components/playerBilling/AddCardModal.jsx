import React, { useEffect, useState } from 'react';

const defaultForm = {
  cardType: 'Classic',
  cardHolderName: '',
  cardNumber: '',
  expiryDate: '',
};

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSubmit: (payload: typeof defaultForm) => Promise<void>,
 *   editing?: { id: string, cardHolderName?: string, last4?: string, expiryDate?: string, cardType?: string } | null,
 *   busy?: boolean,
 * }}
 */
export default function AddCardModal({ open, onClose, onSubmit, editing, busy }) {
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        cardType: editing.cardType || 'Classic',
        cardHolderName: editing.cardHolderName || '',
        cardNumber: '',
        expiryDate: editing.expiryDate || '',
      });
    } else {
      setForm(defaultForm);
    }
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    await onSubmit(form);
  }

  return (
    <div
      className="pb-modal-overlay"
      role="presentation"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="pb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pb-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="pb-modal__title" id="pb-modal-title">
          {editing ? 'Edit card' : 'Add new card'}
        </h2>
        <p className="pb-modal__hint">
          For security, only the last four digits are stored. Never share your full card number in chat
          or email.
        </p>
        {editing?.last4 ? (
          <p className="pb-modal__hint" style={{ marginTop: -12 }}>
            Current card ends in <strong>{editing.last4}</strong>. Leave card number blank to keep it.
          </p>
        ) : null}
        <form onSubmit={handleSubmit}>
          <div className="pb-field">
            <label htmlFor="pb-card-type">Card type</label>
            <input
              id="pb-card-type"
              value={form.cardType}
              onChange={(e) => setForm((f) => ({ ...f, cardType: e.target.value }))}
              placeholder="Classic"
              autoComplete="cc-type"
            />
          </div>
          <div className="pb-field">
            <label htmlFor="pb-card-name">Name on card</label>
            <input
              id="pb-card-name"
              value={form.cardHolderName}
              onChange={(e) => setForm((f) => ({ ...f, cardHolderName: e.target.value }))}
              placeholder="My cards"
              required
              autoComplete="cc-name"
            />
          </div>
          <div className="pb-field">
            <label htmlFor="pb-card-num">Card number</label>
            <input
              id="pb-card-num"
              value={form.cardNumber}
              onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value }))}
              placeholder="•••• •••• •••• ••••"
              inputMode="numeric"
              autoComplete="cc-number"
              required={!editing}
            />
          </div>
          <div className="pb-field">
            <label htmlFor="pb-card-exp">Expiry (MM/YY)</label>
            <input
              id="pb-card-exp"
              value={form.expiryDate}
              onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
              placeholder="11/28"
              autoComplete="cc-exp"
              required
            />
          </div>
          <div className="pb-modal__actions">
            <button type="button" className="pb-btn pb-btn--ghost-wide" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="pb-btn pb-btn--blue" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Update card' : 'Add card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
