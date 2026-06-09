import React from 'react';
import { Search, RefreshCw } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'All Messages' },
  { value: 'new', label: 'New' },
  { value: 'read', label: 'Read' },
  { value: 'replied', label: 'Replied' },
  { value: 'archived', label: 'Archived' },
];

export default function ContactFilters({
  statusFilter,
  onStatusChange,
  searchQuery,
  onSearchChange,
  onRefresh,
  loading,
}) {
  return (
    <div className="contactAdmin-headerTools">
      <div className="contactAdmin-searchWrap">
        <Search className="contactAdmin-searchIcon" size={18} aria-hidden />
        <label className="contactAdmin-srOnly" htmlFor="contact-admin-search">
          Search inquiries
        </label>
        <input
          id="contact-admin-search"
          type="search"
          className="contactAdmin-search contactAdmin-search--figma"
          placeholder="Search inquiries…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <label className="contactAdmin-srOnly" htmlFor="contact-admin-status">
        Message filter
      </label>
      <select
        id="contact-admin-status"
        className="contactAdmin-select contactAdmin-select--figma"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value || 'all'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="contactAdmin-iconBtn contactAdmin-iconBtn--withLabel"
        title="Refresh list"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh list"
      >
        <RefreshCw size={18} strokeWidth={2} className={loading ? 'contactAdmin-spin' : ''} aria-hidden />
        <span className="contactAdmin-iconBtnLabel">Refresh</span>
      </button>
    </div>
  );
}
