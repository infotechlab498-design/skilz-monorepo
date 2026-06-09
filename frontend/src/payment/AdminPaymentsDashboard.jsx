import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import Layout from '../Components/Layout';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import { ADMIN_EMAIL } from '../config/admin';
import AdminBlogs from '../admin/AdminBlogs';
import AdminQuestions from '../admin/AdminQuestions';
import AdminContactsPage from '../admin/contacts/AdminContactsPage';
import AdminGameSettings from '../admin/AdminGameSettings.jsx';
import './adminPayments.css';

const DEFAULT_METRICS = {
  mau: 0,
  arpu: 0,
  churnRate: 0,
  fraudPrevention: 0,
};

const DASHBOARD_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'users', label: 'Users' },
  { id: 'payments', label: 'Payments' },
  { id: 'blogs', label: 'Blog Posts' },
  { id: 'questions', label: 'Questions' },
  { id: 'gameSettings', label: 'Game Settings' },
  { id: 'contacts', label: 'Contacts' },
];

function formatRelative(isoTime) {
  if (!isoTime) return 'just now';
  const diff = Date.now() - new Date(isoTime).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

export default function AdminPaymentsDashboard() {
  const authUser = useSelector((s) => s.auth.user);
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const isAdminEmail = String(authUser?.email || '').toLowerCase().trim() === ADMIN_EMAIL;

  const [section, setSection] = useState('dashboard');
  const [dashboardRange, setDashboardRange] = useState('monthly');
  const [volumeChannel, setVolumeChannel] = useState('all');
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [paymentsSearchDebounced, setPaymentsSearchDebounced] = useState('');
  const [usersSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [methodFilter, setMethodFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, hasNext: false });
  const [usersFilter, setUsersFilter] = useState('all');
  const [usersStatusFilter, setUsersStatusFilter] = useState('all');
  const [usersSortBy, setUsersSortBy] = useState('createdAt');
  const [usersSortDir, setUsersSortDir] = useState('desc');
  const [usersPage, setUsersPage] = useState(1);
  const [usersPagination, setUsersPagination] = useState({
    page: 1,
    limit: 8,
    total: 0,
    hasNext: false,
  });
  const [reason, setReason] = useState('');
  const [confirmIntent, setConfirmIntent] = useState('');
  const [userActionReason, setUserActionReason] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserLoading, setSelectedUserLoading] = useState(false);
  const [selectedUserPayments, setSelectedUserPayments] = useState([]);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [metrics, setMetrics] = useState(DEFAULT_METRICS);
  const [revenuePoints, setRevenuePoints] = useState([]);
  const [paymentVolume, setPaymentVolume] = useState([]);
  const [events, setEvents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentStats, setPaymentStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    approvedToday: 0,
    rejectedRequests: 0,
  });
  const [users, setUsers] = useState([]);
  const [usersStats, setUsersStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    adminUsers: 0,
    blockedUsers: 0,
    bannedToday: 0,
  });
  const paymentsTableRef = useRef(null);

  const loadDashboard = useCallback(async () => {
    setMetricsLoading(true);
    try {
      // Admin analytics GETs (`api.js` → /api/admin/metrics, revenue-trends, payment-volume, events) — same 403 rules as payments/users.
      const [metricsRes, revenueRes, volumeRes, eventsRes] = await Promise.all([
        api.getAdminDashboardMetrics(dashboardRange),
        api.getAdminRevenueTrends(dashboardRange),
        api.getAdminPaymentVolume('weekly', volumeChannel),
        api.getAdminEvents(12),
      ]);
      setMetrics(metricsRes?.metrics || DEFAULT_METRICS);
      setRevenuePoints(Array.isArray(revenueRes?.points) ? revenueRes.points : []);
      setPaymentVolume(Array.isArray(volumeRes?.series) ? volumeRes.series : []);
      setEvents(Array.isArray(eventsRes?.events) ? eventsRes.events : []);
    } catch (error) {
      setToast(error.message || 'Unable to load dashboard analytics');
    } finally {
      setMetricsLoading(false);
    }
  }, [dashboardRange, volumeChannel]);

  const loadPayments = useCallback(async () => {
    setTableLoading(true);
    try {
      // Triggers `frontend/src/services/api.js` → GET /api/admin/payments + /api/admin/payment-stats.
      // DevTools 403 + stack to this block: rejection is thrown in api.js after the server responds (see backend `middleware/auth.js`, `adminMiddleware.js`).
      const [result, statsResult] = await Promise.all([
        api.getAdminPayments({
          status: statusFilter,
          method: methodFilter,
          query: paymentsSearchDebounced,
          page,
          limit: 20,
        }),
        api.getAdminPaymentStats(),
      ]);
      setPayments(Array.isArray(result?.payments) ? result.payments : []);
      setPagination(result?.pagination || { page: 1, limit: 20, total: 0, hasNext: false });
      setPaymentStats(
        statsResult?.stats || {
          totalRequests: 0,
          pendingRequests: 0,
          approvedToday: 0,
          rejectedRequests: 0,
        }
      );
    } catch (error) {
      setToast(error.message || 'Unable to load payment requests');
    } finally {
      setTableLoading(false);
    }
  }, [statusFilter, methodFilter, page, paymentsSearchDebounced]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const mapFilterToRole = usersFilter === 'admins' ? 'admin' : usersFilter === 'users' ? 'user' : '';
      const mapFilterToStatus = usersFilter === 'active' ? 'active' : usersFilter === 'blocked' ? 'blocked' : '';
      // GET /api/admin/users via `api.js`; 403 = invalid Firebase ID token or non-admin (server).
      const result = await api.getAdminUsers({
        query: usersSearch,
        role: mapFilterToRole,
        status: usersStatusFilter !== 'all' ? usersStatusFilter : mapFilterToStatus,
        sortBy: usersSortBy,
        sortDir: usersSortDir,
        page: usersPage,
        limit: 8,
      });
      setUsers(Array.isArray(result?.users) ? result.users : []);
      setUsersStats(
        result?.stats || {
          totalUsers: 0,
          activeUsers: 0,
          adminUsers: 0,
          blockedUsers: 0,
          bannedToday: 0,
        }
      );
      setUsersPagination(result?.pagination || { page: 1, limit: 8, total: 0, hasNext: false });
    } catch (error) {
      setToast(error.message || 'Unable to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [usersFilter, usersPage, usersSortBy, usersSortDir, usersStatusFilter, usersSearch]);

  useEffect(() => {
    if (!isAdminEmail || !firebaseReady) return;
    void loadDashboard();
  }, [isAdminEmail, firebaseReady, loadDashboard]);

  useEffect(() => {
    if (!isAdminEmail || !firebaseReady) return;
    // React Strict Mode (dev) runs effects twice → duplicate Network requests; production runs once.
    void loadPayments();
  }, [isAdminEmail, firebaseReady, loadPayments]);

  useEffect(() => {
    if (!isAdminEmail || !firebaseReady) return;
    void loadUsers();
  }, [isAdminEmail, firebaseReady, loadUsers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPaymentsSearchDebounced(paymentsSearch.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [paymentsSearch]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (selectedPayment) return;
    setConfirmIntent('');
    setReason('');
  }, [selectedPayment]);

  useEffect(() => {
    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const usersFiltered = useMemo(() => users, [users]);

  const usersCards = useMemo(
    () => [
      { key: 'totalUsers', label: 'Total Users', value: usersStats.totalUsers, note: '' },
      { key: 'activeUsers', label: 'Active Users', value: usersStats.activeUsers, note: '' },
      { key: 'adminUsers', label: 'Admin Users', value: usersStats.adminUsers, note: '' },
      { key: 'blockedUsers', label: 'Blocked Users', value: usersStats.blockedUsers, note: '' },
    ],
    [usersStats]
  );

  const exportUsersCsv = () => {
    const header = ['uid', 'name', 'email', 'role', 'status', 'coins', 'createdAt'];
    const lines = usersFiltered.map((u) =>
      [u.uid, u.name, u.email, u.role, u.status, Number(u.coins || 0), u.createdAt || '']
        .map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `users_export_${Date.now()}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openUserModal = async (userId) => {
    setSelectedUserLoading(true);
    setSelectedUserPayments([]);
    try {
      const result = await api.getAdminUserById(userId);
      setSelectedUser(result?.user || null);
      setSelectedUserPayments(Array.isArray(result?.paymentHistory) ? result.paymentHistory : []);
    } catch (error) {
      setToast(error.message || 'Unable to load user details');
    } finally {
      setSelectedUserLoading(false);
    }
  };

  const handleUserAction = async (action, user) => {
    const userId = user?.uid;
    if (!userId) return;
    setActionLoadingId(`${action}:${userId}`);
    try {
      if (action === 'role') {
        const nextRole = user.role === 'admin' ? 'user' : 'admin';
        await api.updateAdminUserRole({ userId, role: nextRole, reason: userActionReason });
      } else if (action === 'block') {
        await api.blockAdminUser({ userId, reason: userActionReason });
      } else if (action === 'unblock') {
        await api.unblockAdminUser({ userId, reason: userActionReason });
      }
      setToast('User action completed');
      await loadUsers();
      if (selectedUser?.uid === userId) {
        await openUserModal(userId);
      }
    } catch (error) {
      setToast(error.message || 'User action failed');
    } finally {
      setActionLoadingId('');
    }
  };

  const requestAction = async (action, requestId) => {
    setActionLoadingId(`${action}:${requestId}`);
    try {
      const payload = action === 'reject' ? { requestId, reason } : requestId;
      if (action === 'approve') {
        await api.approvePayment(requestId);
      } else {
        await api.rejectPayment(payload);
      }
      setToast(action === 'approve' ? 'Payment Approved' : 'Payment Rejected');
      setSelectedPayment(null);
      setReason('');
      setConfirmIntent('');
      await Promise.all([loadPayments(), loadDashboard()]);
    } catch (error) {
      setToast(error.message || `${action} failed`);
    } finally {
      setActionLoadingId('');
    }
  };

  const handleOpenPendingPaymentsQueue = () => {
    setSection('payments');
    setIsSidebarOpen(false);
    setStatusFilter('pending');
    setMethodFilter('');
    setPage(1);
    setPaymentsSearch('');
    setPaymentsSearchDebounced('');
    setTimeout(() => {
      paymentsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  if (!isAdminEmail) {
    return <Navigate to="/" replace />;
  }

  if (!firebaseReady) {
    return (
      <Layout>
        <div className="saasAdmin" style={{ padding: 24, color: '#475467' }}>
          Restoring session…
        </div>
      </Layout>
    );
  }

  const handleSectionChange = (nextSection) => {
    setSection(nextSection);
    setIsSidebarOpen(false);
  };

  const kpiCards = [
    {
      key: 'mau',
      label: 'MAU',
      value: Number(metrics.mau || 0).toLocaleString(),
      subtitle: 'Active players this month',
      delta: '+12.4%',
      tone: 'success',
    },
    {
      key: 'arpu',
      label: 'ARPU',
      value: `$${Number(metrics.arpu || 0).toFixed(2)}`,
      subtitle: 'Avg revenue per user',
      delta: '+$4.20',
      tone: 'success',
    },
    {
      key: 'churnRate',
      label: 'CHURN RATE',
      value: `${Number(metrics.churnRate || 0).toFixed(1)}%`,
      subtitle: 'Monthly user attrition',
      delta: '-0.8%',
      tone: 'danger',
    },
    {
      key: 'fraudPrevention',
      label: 'FRAUD PREVENTION',
      value: `${Number(metrics.fraudPrevention || 0).toFixed(1)}%`,
      subtitle: 'Successful verifications',
      delta: 'Optimal',
      tone: 'success',
    },
  ];

  return (
<Layout>

    <div className="saasAdmin">
      {isSidebarOpen ? (
        <button
          type="button"
          className="saasAdmin-sidebarOverlay"
          aria-label="Close admin menu"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}
      <aside className={`saasAdmin-sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
        <div className="saasAdmin-brand">
          <h1>Admin Dashboard</h1>
          <p>Verification Suite</p>
        </div>
        <button
          type="button"
          className="saasAdmin-sidebarClose"
          aria-label="Close admin menu"
          onClick={() => setIsSidebarOpen(false)}
        >
          ✕
        </button>
        <nav className="saasAdmin-nav">
          {DASHBOARD_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`saasAdmin-navItem ${section === item.id ? 'is-active' : ''}`}
              onClick={() => handleSectionChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {/* <button type="button" className="saasAdmin-verifyBtn">
          Verify New Player
        </button>
        <div className="saasAdmin-footerLinks">
          <button type="button">Settings</button>
          <button type="button">Support</button>
        </div> */}
      </aside>

      <div className="saasAdmin-main">
        <div className="saasAdmin-mobileTopbar">
          <button
            type="button"
            className="saasAdmin-menuBtn"
            aria-label="Open admin menu"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
          >
            ☰
          </button>
          <div className="saasAdmin-mobileTopbarTitle">
            <strong>Admin Dashboard</strong>
            <small>
              {section === 'dashboard'
                ? 'Analytics'
                : section === 'users'
                  ? 'Users'
                  : section === 'blogs'
                    ? 'Blog Posts'
                    : section === 'questions'
                      ? 'Trivia questions'
                      : section === 'gameSettings'
                        ? 'Game economy'
                        : section === 'contacts'
                        ? 'Contacts'
                        : 'Payments'}
            </small>
          </div>
        </div>
        {/* <header className="saasAdmin-topbar">
          <input
            value={section === 'users' ? usersSearch : paymentsSearch}
            onChange={(e) => {
              const next = e.target.value;
              if (section === 'users') {
                setUsersSearch(next);
                setUsersPage(1);
              } else {
                setPaymentsSearch(next);
                setPage(1);
              }
            }}
            placeholder={section === 'users' ? 'Search by email, name, or uid...' : 'Search by email or order id...'}
          />
          <div className="saasAdmin-topActions">
            <button type="button">🔔</button>
            <button type="button">◐</button>
           
           
          </div>
        </header> */}

        {toast ? <div className="saasAdmin-toast">{toast}</div> : null}

        <div className="saasAdmin-mainInner">
        {section === 'dashboard' ? (
          <>
            <section className="saasAdmin-headline">
              <div>
                <h2>VexCore Analytics</h2>
                <p>Real-time performance metrics and revenue tracking.</p>
              </div>
              <div className="saasAdmin-controls">
                <select value={dashboardRange} onChange={(e) => setDashboardRange(e.target.value)}>
                  <option value="weekly">Last 7 Days</option>
                  <option value="monthly">Last 30 Days</option>
                  <option value="yearly">Last 12 Months</option>
                </select>
              </div>
            </section>

            <section className="saasAdmin-kpis">
              {kpiCards.map((card) => (
                <article
                  key={card.key}
                  className={`saasAdmin-kpiCard${
                    card.key === 'arpu' || card.key === 'fraudPrevention'
                      ? ' saasAdmin-holdUntilTraffic'
                      : ''
                  }`}
                >
                  <div className="saasAdmin-kpiHead">
                    <span className="saasAdmin-kpiIcon">◈</span>
                    <span className={`saasAdmin-kpiDelta ${card.tone}`}>{card.delta}</span>
                  </div>
                  <p>{card.label}</p>
                  <h3>{metricsLoading ? '...' : card.value}</h3>
                  <small>{card.subtitle}</small>
                </article>
              ))}
            </section>

            <section className="saasAdmin-revenuePanel saasAdmin-holdUntilTraffic">
              <div className="saasAdmin-panelHead">
                <div>
                  <h3>Revenue Trends</h3>
                  <p>Comprehensive overview of global earnings.</p>
                </div>
              </div>
              <div className="saasAdmin-chartWrap">
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={revenuePoints}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff4fd8" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#6a5cff" stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.09)" vertical={false} />
                    <XAxis dataKey="label" stroke="#98a2b3" />
                    <YAxis stroke="#98a2b3" />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#ff4fd8" strokeWidth={3} fill="url(#revenueFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="saasAdmin-bottomGrid">
              <article className="saasAdmin-card saasAdmin-holdUntilTraffic">
                <div className="saasAdmin-panelHead">
                  <h3>Payment Volume</h3>
                  <select value={volumeChannel} onChange={(e) => setVolumeChannel(e.target.value)}>
                    <option value="all">All Channels</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="easypaisa">EasyPaisa</option>
                    <option value="bank">Bank</option>
                  </select>
                </div>
                <div className="saasAdmin-volumeChart">
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={paymentVolume}>
                      <CartesianGrid stroke="#eaecf0" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="label" stroke="#98a2b3" />
                      <YAxis stroke="#98a2b3" />
                      <Tooltip />
                      <Line
                        dataKey="count"
                        type="monotone"
                        stroke="#6a5cff"
                        strokeWidth={3}
                        dot={{ r: 2, fill: '#6a5cff' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="saasAdmin-card saasAdmin-feed">
                <div className="saasAdmin-panelHead">
                  <h3>Active Feed</h3>
                  <span className="saasAdmin-liveDot" />
                </div>
                <div className="saasAdmin-feedList">
                  {events.length === 0 ? <p className="saasAdmin-empty">No events yet.</p> : null}
                  {events.map((event) => (
                    <div key={`${event.source}-${event.id}`} className="saasAdmin-feedItem">
                      <div className="saasAdmin-feedIcon">◍</div>
                      <div>
                        <h4>{event.title}</h4>
                        <p>{event.subtitle}</p>
                        <small>{formatRelative(event.createdAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="saasAdmin-auditBtn">
                  View Audit Log
                </button>
              </article>
            </section>
          </>
        ) : null}

        {section === 'users' ? (
          <>
            <section className="saasAdmin-headline usersHead">
              <div>
                <h2>Users Management</h2>
                <p>Manage and monitor all registered users</p>
              </div>
              <div className="saasAdmin-controls usersControl">
                <select
                  value={usersFilter}
                  onChange={(e) => {
                    setUsersFilter(e.target.value);
                    setUsersPage(1);
                  }}
                >
                  <option value="all">All Users</option>
                  <option value="admins">Admins</option>
                  <option value="active">Active Users</option>
                  <option value="blocked">Blocked Users</option>
                </select>
                <button
                  type="button"
                  className="saasAdmin-verifyBtn usersVerifyBtn"
                  onClick={handleOpenPendingPaymentsQueue}
                >
                  Verify New Player
                </button>
              </div>
            </section>

            <section className="saasAdmin-kpis usersKpis">
              {usersCards.map((card) => (
                <article key={card.key} className="saasAdmin-kpiCard usersKpiCard">
                  <div className="saasAdmin-kpiHead">
                    <span className="saasAdmin-kpiIcon">◎</span>
                  </div>
                  <p>{card.label}</p>
                  <h3>{Number(card.value || 0).toLocaleString()}</h3>
                  {card.note ? <small>{card.note}</small> : null}
                </article>
              ))}
            </section>

            <section className="saasAdmin-card saasAdmin-tableCard">
              <div className="saasAdmin-panelHead usersToolbar">
                <div className="saasAdmin-filters">
                  <select
                    value={usersStatusFilter}
                    onChange={(e) => {
                      setUsersStatusFilter(e.target.value);
                      setUsersPage(1);
                    }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <select
                    value={usersSortBy}
                    onChange={(e) => {
                      setUsersSortBy(e.target.value);
                      setUsersPage(1);
                    }}
                  >
                    <option value="createdAt">Sort By Date</option>
                    <option value="coins">Sort By Coins</option>
                  </select>
                  <select value={usersSortDir} onChange={(e) => setUsersSortDir(e.target.value)}>
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                </div>
                <button type="button" onClick={exportUsersCsv} className="saasAdmin-auditBtn usersExportBtn">
                  Export CSV
                </button>
              </div>

              {usersLoading ? <p className="saasAdmin-empty">Loading users...</p> : null}
              {!usersLoading ? (
                <div className="saasAdmin-table usersTable">
                  <div className="saasAdmin-row head users">
                    <span>User Info</span>
                    <span>Role</span>
                    <span>Coins</span>
                    <span>Status</span>
                    <span>Created</span>
                    <span>Actions</span>
                  </div>
                  {usersFiltered.map((u) => (
                    <div key={u.uid} className="saasAdmin-row users">
                      <span className="usersInfoCell">
                        <span className="usersAvatar">{String(u.name || 'U').slice(0, 1)}</span>
                        <span>
                          <strong>{u.name || 'Player'}</strong>
                          <small>{u.email || '-'}</small>
                        </span>
                      </span>
                      <span className={`usersRole ${u.role === 'admin' ? 'admin' : 'user'}`}>{u.role}</span>
                      <span className="usersCoins">{Number(u.coins || 0).toLocaleString()}</span>
                      <span className={`saasAdmin-status ${u.status || 'active'}`}>
                        {u.status || 'active'}
                      </span>
                      <span>{formatDate(u.createdAt)}</span>
                      <span className="usersActions">
                        <button type="button" onClick={() => openUserModal(u.uid)}>
                          View
                        </button>
                        <button
                          type="button"
                          className="roleBtn"
                          disabled={actionLoadingId === `role:${u.uid}`}
                          onClick={() => handleUserAction('role', u)}
                        >
                          Edit Role
                        </button>
                        {u.status === 'blocked' ? (
                          <button
                            type="button"
                            className="unblockBtn"
                            disabled={actionLoadingId === `unblock:${u.uid}`}
                            onClick={() => handleUserAction('unblock', u)}
                          >
                            Unblock
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="blockBtn"
                            disabled={actionLoadingId === `block:${u.uid}`}
                            onClick={() => handleUserAction('block', u)}
                          >
                            Block
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="saasAdmin-pager usersPager">
                <button
                  type="button"
                  disabled={usersPage <= 1}
                  onClick={() => setUsersPage((prev) => Math.max(1, prev - 1))}
                >
                  ← Previous
                </button>
                <span>
                  Showing page {usersPagination.page} of {Math.max(1, Math.ceil(usersPagination.total / usersPagination.limit || 1))}
                </span>
                <button
                  type="button"
                  disabled={!usersPagination.hasNext}
                  onClick={() => setUsersPage((prev) => prev + 1)}
                >
                  Next →
                </button>
              </div>
            </section>

            <section className="saasAdmin-card usersAlert">
              <div>
                <h4>Player Verification Pending</h4>
                <p>
                  You have {usersStats.bannedToday || 0} flagged users requiring immediate admin review.
                </p>
              </div>
              <button type="button" onClick={handleOpenPendingPaymentsQueue}>
                Review Queue
              </button>
            </section>
          </>
        ) : null}

        {section === 'payments' ? (
          <>
            <section className="saasAdmin-headline paymentsHead">
              <div>
                <h2>Payment Requests</h2>
                <p>Verify and manage user payments</p>
              </div>
              <button type="button" className="saasAdmin-auditBtn paymentsExportBtn">
                Export CSV
              </button>
            </section>

            <section className="saasAdmin-kpis paymentsKpis">
              <article className="saasAdmin-kpiCard">
                <div className="saasAdmin-kpiHead">
                  <span className="saasAdmin-kpiIcon">◎</span>
                </div>
                <p>Total Requests</p>
                <h3>{Number(paymentStats.totalRequests || 0).toLocaleString()}</h3>
              </article>
              <article className="saasAdmin-kpiCard">
                <div className="saasAdmin-kpiHead">
                  <span className="saasAdmin-kpiIcon">⏳</span>
                </div>
                <p>Pending Requests</p>
                <h3>{Number(paymentStats.pendingRequests || 0).toLocaleString()}</h3>
              </article>
              <article className="saasAdmin-kpiCard">
                <div className="saasAdmin-kpiHead">
                  <span className="saasAdmin-kpiIcon">✓</span>
                </div>
                <p>Approved Today</p>
                <h3>{Number(paymentStats.approvedToday || 0).toLocaleString()}</h3>
              </article>
              <article className="saasAdmin-kpiCard">
                <div className="saasAdmin-kpiHead">
                  <span className="saasAdmin-kpiIcon">!</span>
                </div>
                <p>Rejected Requests</p>
                <h3>{Number(paymentStats.rejectedRequests || 0).toLocaleString()}</h3>
              </article>
            </section>

            <section ref={paymentsTableRef} className="saasAdmin-card saasAdmin-tableCard paymentsTableCard">
              <div className="saasAdmin-panelHead paymentsToolbar">
                <h3>Payment Requests</h3>
                <div className="saasAdmin-filters">
                  <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                    <option value="">All Methods</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="easypaisa">EasyPaisa</option>
                    <option value="bank">Bank</option>
                  </select>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              {tableLoading ? <p className="saasAdmin-empty">Loading payments...</p> : null}
              {!tableLoading ? (
                <div className="saasAdmin-table paymentsTable">
                  <div className="saasAdmin-row head payments">
                    <span>User</span>
                    <span>Coins</span>
                    <span>Method</span>
                    <span>Screenshot</span>
                    <span>Status</span>
                    <span>Date</span>
                    <span>Actions</span>
                  </div>
                  {payments.map((p) => (
                    <div key={p.id} className="saasAdmin-row payments">
                      <span className="paymentsUser">
                        <strong>{p.userName || '-'}</strong>
                        <small>{p.userEmail || '-'}</small>
                      </span>
                      <span>{Number(p.coinsRequested || 0).toLocaleString()}</span>
                      <span className={`paymentsMethod ${String(p.paymentMethod || '').toLowerCase()}`}>
                        {p.paymentMethod || '-'}
                      </span>
                      <span>
                        {p.screenshotUrl ? (
                          <button
                            type="button"
                            className="paymentThumbBtn"
                            onClick={() => {
                              setSelectedPayment(p);
                              setConfirmIntent('');
                            }}
                          >
                            <img src={p.screenshotUrl} alt="Payment screenshot thumbnail" className="paymentThumb" />
                          </button>
                        ) : (
                          '-'
                        )}
                      </span>
                      <span className={`saasAdmin-status ${String(p.status || '').toLowerCase()}`}>{p.status}</span>
                      <span>{formatDate(p.createdAt)}</span>
                      <span className="paymentsActions">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPayment(p);
                            setConfirmIntent('');
                          }}
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          className="approveRowBtn"
                          disabled={p.status !== 'pending' || actionLoadingId.length > 0}
                          onClick={() => {
                            setSelectedPayment(p);
                            setConfirmIntent('approve');
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="rejectRowBtn"
                          disabled={p.status !== 'pending' || actionLoadingId.length > 0}
                          onClick={() => {
                            setSelectedPayment(p);
                            setConfirmIntent('reject');
                          }}
                        >
                          Reject
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="saasAdmin-pager paymentsPager">
                <span>
                  Showing {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} requests
                </span>
                <div className="paymentsPagerBtns">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                    ← Previous
                  </button>
                  <button
                    type="button"
                    disabled={!pagination.hasNext}
                    onClick={() => setPage((prev) => prev + 1)}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {section === 'blogs' ? <AdminBlogs onNotify={setToast} /> : null}
        {section === 'questions' ? <AdminQuestions onNotify={setToast} /> : null}
        {section === 'gameSettings' ? <AdminGameSettings onNotify={setToast} /> : null}
        {section === 'contacts' ? <AdminContactsPage onNotify={setToast} /> : null}
        </div>
      </div>

      {selectedUser || selectedUserLoading ? (
        <div className="saasAdmin-modal" onClick={() => setSelectedUser(null)} role="presentation">
          <div className="saasAdmin-modalPanel usersModal" onClick={(e) => e.stopPropagation()} role="presentation">
            <div className="saasAdmin-panelHead">
              <h3>User Details</h3>
              <button type="button" onClick={() => setSelectedUser(null)}>
                Close
              </button>
            </div>
            {selectedUserLoading ? <p className="saasAdmin-empty">Loading user details...</p> : null}
            {selectedUser ? (
              <div className="saasAdmin-modalBody usersModalBody">
                <div>
                  <p>
                    <strong>Name:</strong> {selectedUser.name || '-'}
                  </p>
                  <p>
                    <strong>Email:</strong> {selectedUser.email || '-'}
                  </p>
                  <p>
                    <strong>UID:</strong> <span className="mono">{selectedUser.uid}</span>
                  </p>
                  <p>
                    <strong>Coins:</strong> {Number(selectedUser.coins || 0).toLocaleString()}
                  </p>
                  <p>
                    <strong>Status:</strong> {selectedUser.status || 'active'}
                  </p>
                  <p>
                    <strong>Role:</strong> {selectedUser.role || 'user'}
                  </p>
                  <p>
                    <strong>Last active:</strong> {formatDate(selectedUser.lastActiveAt)}
                  </p>
                  {selectedUser.suspicious ? <p className="usersWarning">Suspicious activity detected</p> : null}
                  <textarea
                    value={userActionReason}
                    onChange={(e) => setUserActionReason(e.target.value)}
                    placeholder="Action reason (recommended for audit logs)"
                  />
                </div>
                <div>
                  <h4>Recent Payment History</h4>
                  <div className="usersPaymentList">
                    {selectedUserPayments.length === 0 ? <p className="saasAdmin-empty">No recent payments.</p> : null}
                    {selectedUserPayments.map((row) => (
                      <div key={row.id} className="usersPaymentItem">
                        <div>
                          <strong>{row.orderId || row.id}</strong>
                          <small>{row.paymentMethod || '-'}</small>
                        </div>
                        <div>
                          <span>{Number(row.coinsRequested || 0).toLocaleString()} coins</span>
                          <small>{formatDate(row.createdAt)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {selectedUser ? (
              <div className="saasAdmin-modalActions">
                <button
                  type="button"
                  className="approve"
                  disabled={actionLoadingId === `role:${selectedUser.uid}`}
                  onClick={() => handleUserAction('role', selectedUser)}
                >
                  {selectedUser.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                </button>
                {selectedUser.status === 'blocked' ? (
                  <button
                    type="button"
                    className="approve"
                    disabled={actionLoadingId === `unblock:${selectedUser.uid}`}
                    onClick={() => handleUserAction('unblock', selectedUser)}
                  >
                    Unblock User
                  </button>
                ) : (
                  <button
                    type="button"
                    className="reject"
                    disabled={actionLoadingId === `block:${selectedUser.uid}`}
                    onClick={() => handleUserAction('block', selectedUser)}
                  >
                    Block User
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedPayment ? (
        <div className="saasAdmin-modal" onClick={() => setSelectedPayment(null)} role="presentation">
          <div className="saasAdmin-modalPanel paymentsModal" onClick={(e) => e.stopPropagation()} role="presentation">
            <div className="saasAdmin-panelHead">
              <h3>Verify Payment Request</h3>
              <button type="button" onClick={() => setSelectedPayment(null)}>
                Close
              </button>
            </div>
            <div className="saasAdmin-modalBody">
              <div>
                <p>
                  <strong>User:</strong> {selectedPayment.userName} ({selectedPayment.userEmail || '-'})
                </p>
                <p>
                  <strong>Order ID:</strong> <span className="mono">{selectedPayment.orderId}</span>
                </p>
                <p>
                  <strong>Coins:</strong> {Number(selectedPayment.coinsRequested || 0).toLocaleString()}
                </p>
                <p>
                  <strong>Method:</strong> {selectedPayment.paymentMethod}
                </p>
                <p>
                  <strong>Submitted:</strong> {formatDate(selectedPayment.createdAt)}
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required for reject, optional for approve)"
                />
                {confirmIntent ? (
                  <p className="paymentsConfirmText">
                    Confirm to {confirmIntent} this payment request. This action cannot be undone.
                  </p>
                ) : null}
              </div>
              <div className="saasAdmin-imageWrap">
                {selectedPayment.screenshotUrl ? (
                  <img src={selectedPayment.screenshotUrl} alt="Payment proof" />
                ) : (
                  <p className="saasAdmin-empty">No screenshot attached.</p>
                )}
              </div>
            </div>
            <div className="saasAdmin-modalActions">
              <button
                type="button"
                className="approve approveGradient"
                disabled={selectedPayment.status !== 'pending' || actionLoadingId.length > 0}
                onClick={() => {
                  if (confirmIntent !== 'approve') {
                    setConfirmIntent('approve');
                    return;
                  }
                  void requestAction('approve', selectedPayment.id);
                }}
              >
                {actionLoadingId === `approve:${selectedPayment.id}`
                  ? 'Approving...'
                  : confirmIntent === 'approve'
                    ? 'Confirm Approve'
                    : 'Approve'}
              </button>
              <button
                type="button"
                className="reject rejectOutline"
                disabled={
                  selectedPayment.status !== 'pending' ||
                  actionLoadingId.length > 0 ||
                  !reason.trim().length
                }
                onClick={() => {
                  if (confirmIntent !== 'reject') {
                    setConfirmIntent('reject');
                    return;
                  }
                  void requestAction('reject', selectedPayment.id);
                }}
              >
                {actionLoadingId === `reject:${selectedPayment.id}`
                  ? 'Rejecting...'
                  : confirmIntent === 'reject'
                    ? 'Confirm Reject'
                    : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </Layout>


  );
}
