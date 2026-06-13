import React from 'react';
import { Brain, Coins, Dices, Plus } from 'lucide-react';

const LobbyHeader = ({ title, themeColor, coins, setView, gameId, onRecharge }) => {

    // Default to Brain for Trivia, Dices for Ludo, etc.

    const renderIcon = () => {
        if (gameId === 'trivia' || !gameId) {
            return <Brain className="text-white" size={24} />;
        }
        if (gameId === 'ludo') {
            return <span style={{ fontSize: '1.2rem' }}>🎲</span>;
        }
        return <Brain className="text-white" size={24} />;
    };

    return (
        <header className="TriviaLobby-Header-container">
            <div className="TriviaLobby-Header-container-left">
                <div className="TriviaLobby-Header-container-left-icon" style={{ backgroundColor: themeColor || '#10b981' }}>
                    {renderIcon()}
                </div>
                <h1 className="TriviaLobby-Header-container-logo-title">{title || "IQ Strike"}</h1>
            </div>
            <div className="TriviaLobby-Header-container-right">
                <div className="TriviaLobby-Header-container-right-coins">
                    <Coins size={16} className="TriviaLobby-Header-container-right-coins-icon" />
                    <span className="TriviaLobby-Header-container-right-coins-value">{coins || 0}</span>
                </div>
                {typeof onRecharge === 'function' ? (
                    <button
                        type="button"
                        onClick={onRecharge}
                        className="TriviaLobby-Header-container-right-profile-button"
                        title="Recharge coins"
                        aria-label="Recharge coins"
                    >
                        <Plus size={16} />
                    </button>
                ) : null}
                <button
                    onClick={() => setView('profile')}
                    className="TriviaLobby-Header-container-right-profile-button"
                >
                    p
                </button>
            </div>
        </header>
    );
};

export default LobbyHeader;
