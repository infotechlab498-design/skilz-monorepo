// import React from 'react';
// import Layout from './Layout';

// const Profile = () => {
//     const user = JSON.parse(localStorage.getItem('user') || '{}');

//     return (
//         <Layout>
//             <div style={{ padding: '100px 20px', textAlign: 'center', color: '#fff' }}>
//                 <h1>My Profile</h1>
//                 <div style={{ background: '#202738', padding: '40px', borderRadius: '16px', maxWidth: '500px', margin: '20px auto' }}>
//                     <div style={{ width: '100px', height: '100px', background: '#4f7cff', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>
//                         {user.username ? user.username.charAt(0).toUpperCase() : 'P'}
//                     </div>
//                     <h2>{user.username || 'Guest User'}</h2>
//                     <p style={{ opacity: 0.7 }}>{user.email || 'No email provided'}</p>
//                     <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
//                         <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
//                             <div style={{ fontSize: '12px', opacity: 0.5 }}>XP</div>
//                             <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{user.xp || 0}</div>
//                         </div>
//                         <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
//                             <div style={{ fontSize: '12px', opacity: 0.5 }}>Wins</div>
//                             <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{user.wins || 0}</div>
//                         </div>
//                     </div>
//                 </div>
//             </div>
// import React from 'react';
// import Layout from './Layout';

// const Profile = () => {
//     const user = JSON.parse(localStorage.getItem('user') || '{}');

//     return (
//         <Layout>
//             <div style={{ padding: '100px 20px', textAlign: 'center', color: '#fff' }}>
//                 <h1>My Profile</h1>
//                 <div style={{ background: '#202738', padding: '40px', borderRadius: '16px', maxWidth: '500px', margin: '20px auto' }}>
//                     <div style={{ width: '100px', height: '100px', background: '#4f7cff', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>
//                         {user.username ? user.username.charAt(0).toUpperCase() : 'P'}
//                     </div>
//                     <h2>{user.username || 'Guest User'}</h2>
//                     <p style={{ opacity: 0.7 }}>{user.email || 'No email provided'}</p>
//                     <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
//                         <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
//                             <div style={{ fontSize: '12px', opacity: 0.5 }}>XP</div>
//                             <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{user.xp || 0}</div>
//                         </div>
//                         <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
//                             <div style={{ fontSize: '12px', opacity: 0.5 }}>Wins</div>
//                             <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{user.wins || 0}</div>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//         </Layout>
//     );
// };

// export default Profile;

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
    Trophy,
    Zap,
    Award,
    Lock,
    Wallet,
    TrendingUp,
    Target,
    Flame,
    Skull,
    Dices,
    Medal,
    CheckCircle2,
    UserPlus,
    ShieldCheck,
    ChevronRight,
    CircleDollarSign,
    Coins
} from "lucide-react";
import "./ludoProfile.css";
import Layout from "./Layout";
import { useUser } from "../context/UserContext";

const Profile = () => {
    const { user } = useUser();
    const navigate = useNavigate();
    const [showAllAchievements, setShowAllAchievements] = useState(false);

    const goback = () => {
        navigate('/ludoLobby');
    };

    // Fallback data if user is not fully populated
    const profileData = useMemo(() => ({
        username: user?.username || "CYBER_KING",
        rank: user?.rank || "GRANDMASTER",
        level: user?.level || 42,
        xp: user?.xp || 4280,
        nextLevelXp: user?.nextLevelXp || 5000,
        coins: user?.coins ? (user.coins / 1000000).toFixed(1) + "M" : "2.4M",
        progress: user?.xp ? (user.xp / (user.nextLevelXp || 5000)) * 100 : 70,
        avatar: user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
    }), [user]);

    const achievementsData = [
        { title: "Undefeated Streak", subtitle: "10 GAMES WON", icon: <Trophy size={30} />, locked: false },
        { title: "Blitz Striker", subtitle: "WIN IN < 5 MINS", icon: <Zap size={30} />, locked: false },
        { title: "Ludo Legend", subtitle: "LEVEL 40 REACHED", icon: <Award size={30} />, locked: false },
        { title: "Whale Hunter", subtitle: "WIN 1M POT", icon: <Lock size={30} />, locked: true },
        { title: "Global Top 10", subtitle: "REACH TIER 1", icon: <Lock size={30} />, locked: true },
    ];

    const displayedAchievements = showAllAchievements ? achievementsData : achievementsData.slice(0, 3);

    const statsData = [
        { label: "WIN RATE", value: user?.stats?.winRate || "68.4%", highlight: "highlight-blue" },
        { label: "LONGEST STREAK", value: user?.stats?.longestStreak || "14", highlight: "" },
        { label: "PAWN KILLS", value: user?.stats?.pawnKills || "8,402", highlight: "" },
        { label: "TOURNAMENT WINS", value: user?.stats?.tournamentWins || "12", highlight: "highlight-orange" },
        { label: "XP GAINED", value: "24.5K", highlight: "" },
        { label: "DICE ROLLS", value: "14.2K", highlight: "" },
        { label: "TOKEN KILLS", value: "1.2K", highlight: "highlight-blue" },
    ];

    const displayedStats = showAllAchievements ? statsData : statsData.slice(0, 6);

    const activityData = [
        { type: 'victory', title: "Victory vs Player442", meta: "+500 Coins • 2m ago", icon: <CheckCircle2 size={22} />, bg: "bg-victory" },
        { type: 'follower', title: "New Follower: LunaPro", meta: "Grandmaster Tier • 15m ago", icon: <UserPlus size={22} />, bg: "bg-follower" },
        { type: 'badge', title: "Badge Unlocked", meta: "Blitz Striker • 1h ago", icon: <ShieldCheck size={22} />, bg: "bg-badge" },
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const itemVariants = {
        hidden: { y: 15, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: "spring", stiffness: 150 }
        }
    };

    return (
        <Layout>
            <div className="profile-container">

                {/* TOP NAVIGATION */}

                <header className="top-nav">
                    <div className="nav-left">
                        {/* <img src={profileData.avatar} alt="Avatar" className="nav-avatar" /> */}
                        <span className="brand-name" onClick={() => { goback() }}>Move to Lobby</span>
                    </div>
                    <div className="nav-right">
                        <div className="xp-pill">
                            <CircleDollarSign size={18} className="xp-icon-gold" />
                            {profileData.xp.toLocaleString()} XP
                        </div>
                        <button className="wallet-btn">
                            <Wallet size={20} />
                        </button>
                    </div>
                </header>

                <motion.div
                    className="profile-grid"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    {/* LEFT CONTENT AREA */}
                    <main className="main-content">

                        {/* HEADER SECTION */}

                        <section className="profile-header">
                            <div className="user-info">
                                <div className="username-row">
                                    <h1 className="username-h1">{profileData.username}</h1>
                                    <span className="rank-badge">{profileData.rank}</span>
                                </div>

                                <div className="level-section">
                                    <div className="level-meta">
                                        <span className="level-tag">LEVEL {profileData.level}</span>
                                        <span className="next-level-xp">NEXT LEVEL: {profileData.nextLevelXp.toLocaleString()} XP</span>
                                    </div>
                                    <div className="progress-track">
                                        <motion.div
                                            className="progress-bar"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${profileData.progress}%` }}
                                            transition={{ duration: 1.2, ease: "circOut" }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <motion.div
                                className="coins-won-card"
                                whileHover={{ scale: 1.01 }}
                            >
                                <span className="coins-label">TOTAL COINS WON</span>
                                <div className="coins-value-row">
                                    <div className="coin-icon-large">
                                        <Coins size={26} />
                                    </div>
                                    <h2 className="coins-amount">{profileData.coins}</h2>
                                </div>
                            </motion.div>
                        </section>

                        {/* ELITE ACHIEVEMENTS */}
                        <section className="achievements-section">
                            <div className="section-header">
                                <h2 className="section-title">
                                    <Award size={24} style={{ color: '#f97316' }} />
                                    ELITE ACHIEVEMENTS
                                </h2>
                                <button
                                    className="view-all-btn"
                                    onClick={() => setShowAllAchievements(!showAllAchievements)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#5fb5ff',
                                        cursor: 'pointer',
                                        fontWeight: 800,
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    {showAllAchievements ? "SHOW LESS" : "VIEW ALL BADGES"}
                                </button>
                            </div>
                            <div className="achievements-scroll">
                                <AnimatePresence mode="popLayout">
                                    {displayedAchievements.map((item, _i) => (
                                        <motion.div
                                            key={item.title}
                                            className="achievement-card"
                                            variants={itemVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit={{ scale: 0.8, opacity: 0 }}
                                            layout
                                        >
                                            <div className={`achievement-icon-wrapper ${item.locked ? 'locked' : 'active'}`}>
                                                {item.icon}
                                            </div>
                                            <h3 className="achievement-title">{item.title}</h3>
                                            <span className="achievement-subtitle">{item.subtitle}</span>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </section>

                    </main>

                    <section className="stats-section">
                        <div className="section-header">
                            <h2 className="section-title">GAME STATISTICS</h2>
                        </div>
                        <div className="stats-grid">
                            <AnimatePresence mode="popLayout">
                                {displayedStats.map((stat, _i) => (
                                    <motion.div
                                        key={stat.label}
                                        className="stat-item"
                                        variants={itemVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        layout
                                    >
                                        <span className="stat-label">{stat.label}</span>
                                        <span className={`stat-value ${stat.highlight}`}>{stat.value}</span>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        <aside className="sidebar-section">
                            <div className="section-header">
                                <h2 className="section-title">RECENT ACTIVITY</h2>
                            </div>
                            <div className="activity-list">
                                {activityData.map((activity, i) => (
                                    <motion.div
                                        key={i}
                                        className="activity-card"
                                        variants={itemVariants}
                                        whileHover={{ x: 5 }}
                                    >
                                        <div className={`activity-icon-container ${activity.bg}`}>
                                            {activity.icon}
                                        </div>
                                        <div className="activity-info">
                                            <span className="activity-main-text">{activity.title}</span>
                                            <span className="activity-meta-text">{activity.meta}</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </aside>
                    </section>

                    {/* RIGHT SIDEBAR */}

                </motion.div>
            </div>
        </Layout>
    );
}

export default Profile;
