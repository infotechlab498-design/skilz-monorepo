import React from 'react';
import icon5 from "/dollar.png";

/**
 * UserBalance - Displays current user coin balance.
 */
const UserBalance = ({ coins }) => {
    return (
        <div className="quantumPay_balanceBox">
            <div className="quantumPay_balanceLabel">AVAILABLE BALANCE</div>
            <div className="quantumPay_balanceValue">
                <div className="quantumPay_coinIconWrap">
                    <img className="quantumPay_coinIcon" alt="Coins" src={icon5} />
                </div>
                <span className="quantumPay_amount">{(coins || 0).toLocaleString()}</span>
            </div>
        </div>
    );
};

export default UserBalance;
