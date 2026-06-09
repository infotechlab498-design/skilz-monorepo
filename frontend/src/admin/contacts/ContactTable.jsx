import React from 'react';
import { Download } from 'lucide-react';
import ContactRow from './ContactRow';

export default function ContactTable({
  messages,
  onOpenRow,
  onQuickArchive,
  emptyHint,
  onExportCsv,
  footer,
}) {
  return (
    <section className="contactAdmin-inquiriesPanel">
      <div className="contactAdmin-inquiriesHead">
        <h3 className="contactAdmin-inquiriesTitle">ACTIVE INQUIRIES</h3>
        <button type="button" className="contactAdmin-exportLink" onClick={onExportCsv} disabled={!messages.length}>
          <Download size={16} aria-hidden />
          Export CSV
        </button>
      </div>
      {!messages.length ? (
        <p className="contactAdmin-empty contactAdmin-empty--inPanel">{emptyHint}</p>
      ) : (
        <div className="contactAdmin-tableWrap contactAdmin-tableWrap--flush">
          <table className="contactAdmin-table">
            <thead>
              <tr>
                <th>User name</th>
                <th>Message preview</th>
                <th>Status</th>
                <th>Received date</th>
                <th className="contactAdmin-thActions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <ContactRow key={m.id} message={m} onOpen={onOpenRow} onQuickArchive={onQuickArchive} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {messages.length > 0 && footer ? <div className="contactAdmin-tableFooter">{footer}</div> : null}
    </section>
  );
}
