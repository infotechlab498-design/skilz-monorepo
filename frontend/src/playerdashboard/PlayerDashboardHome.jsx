import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Coins, HandCoins, ShoppingBag, Trophy, WalletCards } from 'lucide-react';

import '../Components/dashboard/dashboard.css';
import StatsCard from '../Components/dashboard/StatsCard.jsx';
import BlogCard from '../Components/dashboard/BlogCard.jsx';
import ChartBar from '../Components/dashboard/ChartBar.jsx';
import ChartLine from '../Components/dashboard/ChartLine.jsx';
import { fetchPlayerDashboard } from '../api/dashboardApi.js';

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
  const user = useSelector((s) => s.auth.user);
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const uid = user?.uid || null;

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