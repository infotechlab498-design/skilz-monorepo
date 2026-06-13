import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Coins, HandCoins, ShoppingBag, Trophy, WalletCards } from 'lucide-react';

import '../Components/dashboard/dashboard.css';
import StatsCard from '../Components/dashboard/StatsCard.jsx';
import BlogCard from '../Components/dashboard/BlogCard.jsx';
import ChartBar from '../Components/dashboard/ChartBar.jsx';
import ChartLine from '../Components/dashboard/ChartLine.jsx';
import { fetchPlayerDashboard } from '../api/dashboardApi.js';
import { useMergedPlayerProfile } from '../hooks/useBillingAccess.js';
import RechargeCoinsButton from '../Components/RechargeCoinsButton.jsx';
import {
  BILLING_PROFILE_PATH,
  getProfileAttentionMessage,
  needsProfileAttention,
  OAUTH_SIGNUP_PROFILE_PATH,
  resolveProfileComplete,
} from '../utils/profileCompletion.js';

const EMPTY_BAR = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((m) => ({
  month: m,
  wins: 0,
  challenges: 0,
}));
const EMPTY_LINE = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => ({
  month: m,
  rankA: 0,
  rankB: 0,
}));

export default function PlayerDashboardHome() {
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const mergedProfile = useMergedPlayerProfile();
  const uid = user?.uid || null;
  const showProfileCard = needsProfileAttention(mergedProfile);
  const profileCardMessage = getProfileAttentionMessage(mergedProfile);
  const profileCardPath = !resolveProfileComplete(mergedProfile)
    ? OAUTH_SIGNUP_PROFILE_PATH
    : BILLING_PROFILE_PATH;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalBalance: 0,
    walletCoins: 0,
    purchasedCoins: 0,
    rewardCoins: 0,
    referralCoins: 0,
    xp: 0,
    totalSpent: 0,
    changes: {
      totalBalance: 0,
      walletCoins: 0,
      purchasedCoins: 0,
      rewardCoins: 0,
      referralCoins: 0,
      xp: 0,
      totalSpent: 0,
    },
  });
  const [gameStats, setGameStats] = useState({
    barSeries: EMPTY_BAR,
    totalUsersStat: 0,
    totalChallengesStat: 0,
    weeklyGrowthPct: 0,
    syllogismMatches: 0,
    syllogismWins: 0,
    syllogismAccuracy: 0,
  });
  const [ranking, setRanking] = useState(EMPTY_LINE);

  useEffect(() => {
    if (!firebaseReady) return;
    if (!uid) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const bundle = await fetchPlayerDashboard(uid);
        if (!active) return;
        setStats(bundle.stats);
        setGameStats({
          ...bundle.gameStats,
          barSeries: bundle.gameStats?.barSeries?.length ? bundle.gameStats.barSeries : EMPTY_BAR,
        });
        setRanking(bundle.ranking?.length ? bundle.ranking : EMPTY_LINE);
      } catch (e) {
        if (!active) return;
        setError(e?.message || 'Could not load dashboard data.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [firebaseReady, uid]);

  return (
    <section className="dsh-wr">
      <p className="dsh-bc">
        Pages / <span>Dashboard</span>
      </p>

      {error ? <div className="dsh-em" role="status" aria-live="polite">{error}</div> : null}

      {/* {showProfileCard ? (
        <div
          className="dsh-em"
          role="status"
          style={{
            marginBottom: 16,
            padding: '14px 16px',
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 12,
            color: '#92400e',
          }}
        >
          <strong>Complete your profile</strong>
          <p style={{ margin: '8px 0 12px', fontSize: 14 }}>{profileCardMessage}</p>
          <button
            type="button"
            className="signup-btn"
            style={{ margin: 0 }}
            onClick={() => navigate(profileCardPath)}
          >
            Go to profile
          </button>
        </div>
      ) : null} */}

      {/* <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          className="signup-btn"
          style={{ margin: 0 }}
          onClick={() => navigate('/ludoLobby')}
        >
          Play games
        </button>
        <RechargeCoinsButton label="Recharge coins" style={{ margin: 0 }} />
        <button
          type="button"
          className="signup-btn"
          style={{ margin: 0, background: '#64748b' }}
          onClick={() => navigate(showProfileCard ? profileCardPath : '/player/profile')}
        >
          {showProfileCard ? 'Complete profile' : 'Edit profile'}
        </button>
      </div> */}

      <div className="dsh-st">
        <StatsCard
          title="Total Balance"
          value={stats.totalBalance}
          percent={stats.changes.totalBalance}
          currency
          icon={<WalletCards size={20} />}
        />
        <StatsCard
          title="Wallet Coins"
          value={stats.walletCoins}
          percent={stats.changes.walletCoins}
          icon={<Coins size={20} />}
        />
        <StatsCard
          title="XP's"
          value={stats.xp}
          percent={stats.changes.xp}
          icon={<Trophy size={20} />}
        />
        <StatsCard
          title="Purchased Coins"
          value={stats.purchasedCoins}
          percent={stats.changes.purchasedCoins}
          icon={<ShoppingBag size={20} />}
        />
        <StatsCard
          title="Reward Coins"
          value={stats.rewardCoins}
          percent={stats.changes.rewardCoins}
          icon={<HandCoins size={20} />}
        />
        <StatsCard
          title="Referral Coins"
          value={stats.referralCoins}
          percent={stats.changes.referralCoins}
          currency
          icon={<HandCoins size={20} />}
        />
        <StatsCard
          title="Syllogism Matches"
          value={gameStats.syllogismMatches}
          percent={0}
          icon={<Trophy size={20} />}
        />
        <StatsCard
          title="Syllogism Wins"
          value={gameStats.syllogismWins}
          percent={0}
          icon={<Trophy size={20} />}
        />
      </div>

      <div className="dsh-blgRw">
        <BlogCard variant="left" />
        <BlogCard variant="right" />
      </div>

      <div className="dsh-chtRw">
        <ChartBar
          data={gameStats.barSeries}
          weeklyGrowthPct={gameStats.weeklyGrowthPct}
          totalWins={gameStats.totalUsersStat}
          totalMatches={gameStats.totalChallengesStat}
        />
        <ChartLine data={ranking} />
      </div>

      {loading ? <div className="dsh-em" role="status" aria-live="polite">Loading dashboard…</div> : null}
    </section>
  );
}