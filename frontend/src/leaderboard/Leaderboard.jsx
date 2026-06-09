import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Layout from '../Components/Layout.jsx';
import '../leaderboard/leaderboard.css';
import WinnerSlider from './components/WinnerSlider.jsx';
import FilterTabs from './components/FilterTabs.jsx';
import GameSelector from './components/GameSelector.jsx';
import LeaderboardList from './components/LeaderboardList.jsx';
import GameCTAButtons from './components/GameCTAButtons.jsx';
// import OurRecentWinners from '../home/OurRecentWinners.jsx';

import {
  fetchLeaderboard,
  subscribeFriendIds,
  subscribePresence,
} from '../api/leaderboardApi.js';

function rankSort(players) {
  return [...players].sort((a, b) => {
    if ((b.coins || 0) !== (a.coins || 0)) return (b.coins || 0) - (a.coins || 0);
    if ((b.xp || 0) !== (a.xp || 0)) return (b.xp || 0) - (a.xp || 0);
    return (b.level || 0) - (a.level || 0);
  });
}

function applyGameStats(player, gameId) {
  if (!gameId || gameId === 'all') return player;
  const gs = player.gameStats?.[gameId] || {};
  if (!Object.keys(gs).length) return player;
  return {
    ...player,
    xp: Number(gs.xp || 0),
    coins: Number(gs.coins || 0),
    level: Number(gs.level || player.level || 0),
  };
}

export default function Leaderboard() {

  const authUser = useSelector((s) => s.auth.user);
  const uid = authUser?.uid || '';
  const navigate = useNavigate();

  const [players, setPlayers] = useState([]);
  const [presence, setPresence] = useState({});
  const [friendIds, setFriendIds] = useState([]);
  const [mode, setMode] = useState('global');
  const [selectedGame, setSelectedGame] = useState('all');
  const [activeWinnerIndex, setActiveWinnerIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard({ limit: 200 })
      .then((rows) => {
        if (!cancelled) setPlayers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setPlayers([]);
      });
    const unsubPresence = subscribePresence(setPresence);
    const unsubFriends = subscribeFriendIds(uid, setFriendIds);
    return () => {
      cancelled = true;
      unsubPresence && unsubPresence();
      unsubFriends && unsubFriends();
    };
  }, [uid]);

  const filtered = useMemo(() => {
    let base = players;
    if (mode === 'friends' && uid) {
      const friendSet = new Set(friendIds);
      base = players.filter((p) => friendSet.has(p.id) || p.id === uid);
    }
    if (selectedGame !== 'all') {
      base = base
        .map((p) => applyGameStats(p, selectedGame))
        .filter((p) => (p.coins || 0) > 0 || (p.xp || 0) > 0 || (p.level || 0) > 0);
    }
    return rankSort(base);
  }, [players, mode, selectedGame, uid, friendIds]);

  const heroWinners = useMemo(() => filtered.slice(0, 5), [filtered]);

  useEffect(() => {
    setActiveWinnerIndex(0);
  }, [mode, selectedGame, heroWinners.length]);

  useEffect(() => {
    if (heroWinners.length <= 1) return () => {};
    const t = setInterval(() => {
      setActiveWinnerIndex((x) => (x + 1) % heroWinners.length);
    }, 5000);
    return () => clearInterval(t);
  }, [heroWinners.length]);

  function onNavigate(gameId) {
    if (gameId === 'ludo') navigate('/ludoLobby');
    else if (gameId === 'mathQuiz') navigate('/mathRushLobby');
    else navigate('/triviaLobby/trivia');
  }

  return (
    <Layout>
      <section className="lbd-wr">
        <div className="lbd-heroBg">
          <div className="lbd-top">
            <h1 className="lbd-head">One Opponent. One Winner. One Rank.</h1>
            <p className="lbd-sub">
              Track top players in real time, filter by mode or game, and jump into battle instantly.
            </p>
          </div>
          <WinnerSlider
            winners={heroWinners}
            activeIndex={activeWinnerIndex}
            onChange={setActiveWinnerIndex}
          />
          <div className="lbd-slope" aria-hidden="true" />
        </div>

        <div className="lbd-main">
          <h3 className="lbd-mainTitle">★ Competitive Leaderboard ★</h3>

          <div className="lbd-tool">
            <FilterTabs mode={mode} onChange={setMode} />
            <GameSelector selectedGame={selectedGame} onChange={setSelectedGame} />
          </div>

          <LeaderboardList players={filtered} presenceMap={presence} />
          <GameCTAButtons onNavigate={onNavigate} />
        </div> 

{/* <div className='lbd-main-bottom'>
  <OurRecentWinners/>
</div> */}

      </section>
    </Layout>
  );
}

