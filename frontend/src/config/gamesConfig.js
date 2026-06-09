/**
 * Configuration for all games available in the lobby.
 */

export const GAMES_CONFIG = {
    ludo: {
        id: "ludo",
        title: "Ludo Master",
        themeColor: "#e91e63",
        hasTimer: false,
        isPvP: true,
        maxPlayers: 4,
        backgroundImg: "ludo_bg.png",
        description: "Battle it out in the classic board game of Ludo."
    },
    trivia: {
        id: "trivia",
        title: "Trivia Quiz",
        hasTimer: true,
        isPvP: false,
        maxPlayers: 2,
        backgroundImg: "trivia_bg.png",
        description: "Test your knowledge across various categories."
    },
    math: {
        id: "math",
        title: "Math Rush",
        themeColor: "#10b981",
        hasTimer: true,
        isPvP: false,
        maxPlayers: 2,
        backgroundImg: "math_bg.png",
        description: "Solve math problems as fast as you can!"
    },
    followers: {
        id: "followers",
        title: "Followers Challenge",
        themeColor: "#f59e0b",
        hasTimer: false,
        isPvP: true,
        maxPlayers: 2,
        backgroundImg: "followers_bg.png",
        description: "Grow your following and outsmart your rivals."
    }
};

export const getGameConfig = (gameId) => {
    // Extract base game ID if it's a version (e.g., 'math2' -> 'math')
    const baseId = gameId.replace(/[0-9]/g, '');
    return GAMES_CONFIG[baseId] || GAMES_CONFIG.trivia; // Fallback to trivia
};
