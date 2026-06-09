import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Clock, X, Reply, Archive, Send } from 'lucide-react';

function formatModalTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} at ${timePart}`;
}

function splitSubjectBody(text) {
  const raw = String(text || '').trim();
  if (!raw) return { subject: null, body: '' };
  const lines = raw.split(/\n/);
  const first = (lines[0] || '').trim();
  if (/^subject\s*:/i.test(first)) {
    const subject = first.replace(/^subject\s*:/i, '').trim();
    const body = lines.slice(1).join('\n').trim();
    return { subject: subject || null, body: body || '(No message body)' };
  }
  return { subject: null, body: raw };
}

const BADGE_LABEL = {
  new: 'NEW INQUIRY',
  read: 'READ',
  replied: 'REPLIED',
  archived: 'ARCHIVED',
};

export default function ContactDetailsModal({ message, onClose, onSave, onSendReply, saving }) {
  const [adminNotes, setAdminNotes] = useState('');
  const [replyDraft, setReplyDraft] = useState('');

  useEffect(() => {
    if (!message) return;
    setAdminNotes(String(message.adminNotes || ''));
    setReplyDraft(String(message.replyBody || ''));
  }, [message]);

  const statusKey = String(message?.status || 'new').toLowerCase();
  const { subject, body } = useMemo(() => splitSubjectBody(message?.message), [message?.message]);

  if (!message) return null;

  const fullName = `${message.firstName || ''} ${message.lastName || ''}`.trim() || '—';
  const archived = statusKey === 'archived';
  const canEmailReply = !archived && Boolean(String(message.email || '').trim());

  const handleMarkReplied = () => {
    void onSave(message.id, { status: 'replied', adminNotes });
  };

  const handleArchive = () => {
    void onSave(message.id, { status: 'archived', adminNotes });
  };

  const handleSendEmailReply = () => {
    const trimmed = replyDraft.trim();
    if (!trimmed || !onSendReply) return;
    void onSendReply(message.id, { replyBody: trimmed, adminNotes });
  };

  return (
    <div className="contactAdmin-modalOverlay contactAdmin-msgModalOverlay" onClick={onClose} role="presentation">
      <div
        className="contactAdmin-msgModal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-msg-modal-title"
      >
        <header className="contactAdmin-msgModalHead">
          <div className="contactAdmin-msgModalHeadMain">
            <div className="contactAdmin-msgModalIconWrap" aria-hidden>
              <Mail size={22} strokeWidth={2} />
            </div>
            <div className="contactAdmin-msgModalHeadText">
              <div className="contactAdmin-msgModalTitleRow">
                <h2 id="contact-msg-modal-title" className="contactAdmin-msgModalTitle">
                  Message Details
                </h2>
              </div>
              <div className="contactAdmin-msgModalMeta">
                <span className={`contactAdmin-msgBadge contactAdmin-msgBadge--${statusKey}`}>
                  {BADGE_LABEL[statusKey] || statusKey.toUpperCase()}
                </span>
                <span className="contactAdmin-msgModalTime">
                  <Clock size={14} aria-hidden />
                  {formatModalTimestamp(message.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <button type="button" className="contactAdmin-msgModalClose" onClick={onClose} aria-label="Close dialog">
            <X size={22} strokeWidth={2} />
          </button>
        </header>

        <div className="contactAdmin-msgModalBody">
          <div className="contactAdmin-msgCards">
            <div className="contactAdmin-msgCard">
              <span className="contactAdmin-msgCardLabel">Full name</span>
              <p className="contactAdmin-msgCardValue">{fullName}</p>
            </div>
            <div className="contactAdmin-msgCard">
              <span className="contactAdmin-msgCardLabel">Email address</span>
              <p className="contactAdmin-msgCardValue">
                <a className="contactAdmin-msgEmailLink" href={`mailto:${encodeURIComponent(message.email || '')}`}>
                  {message.email || '—'}
                </a>
              </p>
            </div>
          </div>

          <section className="contactAdmin-msgSection">
            <span className="contactAdmin-msgSectionLabel">Message content</span>
            <div className="contactAdmin-msgContentBox">
              {subject ? (
                <>
                  <p className="contactAdmin-msgSubject">
                    <strong>Subject:</strong> {subject}
                  </p>
                  <div className="contactAdmin-msgBodyText">{body}</div>
                </>
              ) : (
                <div className="contactAdmin-msgBodyText">{body}</div>
              )}
            </div>
          </section>

          <section className="contactAdmin-msgSection contactAdmin-replyEmailSection">
            <div className="contactAdmin-msgNotesHead">
              <span className="contactAdmin-msgSectionLabel contactAdmin-msgSectionLabel--notes">Reply by email</span>
              <span className="contactAdmin-msgNotesHint">Delivered to their inbox</span>
            </div>
            <p className="contactAdmin-replyEmailHint">
              {canEmailReply ? (
                <>
                  Your reply will be sent to <strong>{message.email}</strong> (the address they used on the contact form).
                </>
              ) : (
                'Archived inquiries cannot receive email replies.'
              )}
            </p>
            {message.replySentAt ? (
              <p className="contactAdmin-replyEmailSent">
                Last reply emailed {formatModalTimestamp(message.replySentAt)}
              </p>
            ) : null}
            {message.replyEmailLastError ? (
              <p className="contactAdmin-replyEmailError" role="alert">
                Email error: {message.replyEmailLastError}
              </p>
            ) : null}
            <textarea
              id="contact-modal-reply"
              className="contactAdmin-textarea contactAdmin-textarea--modal"
              rows={5}
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder="Write your reply here. It will be emailed to the contact."
              disabled={!canEmailReply || saving}
            />
            <button
              type="button"
              className="contactAdmin-msgFootBtn contactAdmin-msgFootBtn--sendEmail"
              disabled={saving || !canEmailReply || !replyDraft.trim()}
              onClick={handleSendEmailReply}
            >
              <Send size={18} aria-hidden />
              <span>Send email reply</span>
            </button>
          </section>

          <section className="contactAdmin-msgSection">
            <div className="contactAdmin-msgNotesHead">
              <span className="contactAdmin-msgSectionLabel contactAdmin-msgSectionLabel--notes">Internal admin notes</span>
              <span className="contactAdmin-msgNotesHint">Only visible to administrators</span>
            </div>
            <textarea
              id="contact-modal-notes"
              className="contactAdmin-textarea contactAdmin-textarea--modal"
              rows={4}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Add internal notes about this inquiry here..."
            />
          </section>
        </div>

        <footer className="contactAdmin-msgModalFoot">
          <button
            type="button"
            className="contactAdmin-msgFootBtn contactAdmin-msgFootBtn--reply"
            disabled={saving || statusKey === 'replied'}
            onClick={handleMarkReplied}
          >
            <Reply size={18} aria-hidden />
            <span>Mark as Replied</span>
          </button>
          <button
            type="button"
            className="contactAdmin-msgFootBtn contactAdmin-msgFootBtn--archive"
            disabled={saving || statusKey === 'archived'}
            onClick={handleArchive}
          >
            <Archive size={18} aria-hidden />
            <span>Archive</span>
          </button>
          <button type="button" className="contactAdmin-msgFootBtn contactAdmin-msgFootBtn--cancel" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
