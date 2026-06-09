import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import '../../styles/contactAdmin.css';
import ContactStatsCards from './ContactStatsCards';
import ContactFilters from './ContactFilters';
import ContactTable from './ContactTable';
import ContactDetailsModal from './ContactDetailsModal';
import ContactActivityPanel from './ContactActivityPanel';
import ContactPromoCard from './ContactPromoCard';

function toCsvValue(s) {
  const v = String(s ?? '').replace(/"/g, '""');
  return `"${v}"`;
}

export default function AdminContactsPage({ onNotify }) {
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ new: 0, read: 0, replied: 0, archived: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  const notify = useCallback(
    (msg) => {
      if (typeof onNotify === 'function') onNotify(msg);
    },
    [onNotify]
  );

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminContactMessages({
        status: statusFilter || undefined,
        limit: 25,
      });
      setMessages(Array.isArray(res.messages) ? res.messages : []);
      setNextCursor(res.nextCursor || null);
      if (res.stats && typeof res.stats === 'object') setStats(res.stats);
    } catch (e) {
      notify(e.message || 'Failed to load contact messages');
      setMessages([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [notify, statusFilter]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getAdminContactMessages({
        status: statusFilter || undefined,
        cursorDocId: nextCursor,
        limit: 25,
      });
      const chunk = Array.isArray(res.messages) ? res.messages : [];
      setMessages((prev) => [...prev, ...chunk]);
      setNextCursor(res.nextCursor || null);
      if (res.stats && typeof res.stats === 'object') setStats(res.stats);
    } catch (e) {
      notify(e.message || 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, notify, statusFilter]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => {
      const blob = `${m.firstName || ''} ${m.lastName || ''} ${m.email || ''} ${m.message || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [messages, searchQuery]);

  const refreshStatsOnly = useCallback(async () => {
    try {
      const statsRes = await api.getAdminContactMessages({
        status: statusFilter || undefined,
        limit: 1,
      });
      if (statsRes.stats && typeof statsRes.stats === 'object') setStats(statsRes.stats);
    } catch {
      /* optional */
    }
  }, [statusFilter]);

  const handleSave = useCallback(
    async (id, { status, adminNotes }) => {
      setSaving(true);
      try {
        const res = await api.patchAdminContactMessage(id, { status, adminNotes });
        const updated = res.message;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
        setSelected((cur) => (cur && cur.id === id ? { ...cur, ...updated } : cur));
        notify('Saved');
        await refreshStatsOnly();
      } catch (e) {
        notify(e.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [notify, refreshStatsOnly]
  );

  const handleSendReply = useCallback(
    async (id, { replyBody, adminNotes }) => {
      setSaving(true);
      try {
        const res = await api.sendAdminContactReply(id, { replyBody, adminNotes });
        const updated = res.message;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
        setSelected((cur) => (cur && cur.id === id ? { ...cur, ...updated } : cur));
        notify('Reply sent by email');
        await refreshStatsOnly();
      } catch (e) {
        notify(e.message || 'Could not send reply email');
        try {
          const fresh = await api.getAdminContactMessages({
            status: statusFilter || undefined,
            limit: 25,
          });
          const list = Array.isArray(fresh.messages) ? fresh.messages : [];
          const found = list.find((m) => m.id === id);
          if (found) {
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...found } : m)));
            setSelected((cur) => (cur && cur.id === id ? { ...cur, ...found } : cur));
          }
        } catch {
          /* ignore refresh failure */
        }
      } finally {
        setSaving(false);
      }
    },
    [notify, refreshStatsOnly, statusFilter]
  );

  const handleQuickArchive = useCallback(
    async (msg) => {
      try {
        await api.patchAdminContactMessage(msg.id, { status: 'archived' });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'archived' } : m)));
        setSelected((cur) => (cur && cur.id === msg.id ? { ...cur, status: 'archived' } : cur));
        notify('Inquiry archived');
        await refreshStatsOnly();
      } catch (e) {
        notify(e.message || 'Could not archive');
      }
    },
    [notify, refreshStatsOnly]
  );

  const exportCsv = useCallback(() => {
    const rows = filteredMessages;
    if (!rows.length) {
      notify('Nothing to export');
      return;
    }
    const header = ['id', 'firstName', 'lastName', 'email', 'status', 'createdAt', 'message'];
    const lines = [
      header.join(','),
      ...rows.map((m) =>
        [
          toCsvValue(m.id),
          toCsvValue(m.firstName),
          toCsvValue(m.lastName),
          toCsvValue(m.email),
          toCsvValue(m.status),
          toCsvValue(m.createdAt),
          toCsvValue(m.message),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contact-inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('CSV exported');
  }, [filteredMessages, notify]);

  const totalResults = Number(stats.total ?? 0);
  const showingFrom = filteredMessages.length ? 1 : 0;
  const showingTo = filteredMessages.length;

  const tableFooter = !loading && filteredMessages.length ? (
    <div className="contactAdmin-pagination">
      <span className="contactAdmin-paginationMeta">
        Showing {showingFrom} to {showingTo} of {totalResults.toLocaleString()} results
      </span>
      <div className="contactAdmin-paginationBtns">
        <button type="button" className="contactAdmin-btn contactAdmin-btn--secondary" disabled title="Page history not available with cursor pagination">
          Previous
        </button>
        <button type="button" className="contactAdmin-btn contactAdmin-btn--secondary" onClick={() => void loadMore()} disabled={!nextCursor || loadingMore}>
          {loadingMore ? 'Loading…' : 'Next'}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="contactAdmin">
      <header className="contactAdmin-pageHead">
        <div className="contactAdmin-pageHeadText">
          <h2 className="contactAdmin-title">Contact Inquiries</h2>
          <p className="contactAdmin-lead">Manage and respond to user messages efficiently.</p>
        </div>
        <ContactFilters
          statusFilter={statusFilter}
          onStatusChange={(v) => {
            setStatusFilter(v);
            setNextCursor(null);
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={() => void loadFirstPage()}
          loading={loading}
        />
      </header>

      <ContactStatsCards stats={stats} />

      {loading ? (
        <p className="contactAdmin-empty">Loading…</p>
      ) : (
        <ContactTable
          messages={filteredMessages}
          onOpenRow={setSelected}
          onQuickArchive={handleQuickArchive}
          emptyHint={searchQuery.trim() ? 'No inquiries match your search on the loaded data.' : 'No active inquiries yet.'}
          onExportCsv={exportCsv}
          footer={tableFooter}
        />
      )}

      <div className="contactAdmin-bottomGrid">
        <ContactActivityPanel messages={messages} />
        <ContactPromoCard onBuildReport={() => notify('Custom reporting is coming soon.')} />
      </div>

      {selected ? (
        <ContactDetailsModal
          message={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
          onSendReply={handleSendReply}
          saving={saving}
        />
      ) : null}
    </div>
  );
}
