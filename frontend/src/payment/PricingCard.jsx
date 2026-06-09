// import React from 'react';

// /**
//  * PricingCard - A premium card for displaying coin packages.
//  * Uses unique classNames for styling clarity.
//  */
// const PricingCard = ({ plan, onSelect, isSelected }) => {
//     const { coins, price, name, description, bestValue } = plan;

//     return (
//         <div 
//             className={`coinForge_card ${isSelected ? 'coinForge_card--selected' : ''} ${bestValue ? 'coinForge_card--bestValue' : ''}`}
//             onClick={() => onSelect(plan)}
//         >
//             {bestValue && <div className="coinForge_badge">BEST VALUE</div>}

//             <div className="coinForge_iconWrap">
//                 <div className="coinForge_glow" />
//                 <span className="coinForge_icon">💎</span>
//             </div>

//             <div className="coinForge_content">
//                 <h3 className="coinForge_title">{coins} Coins</h3>
//                 <p className="coinForge_subTitle">{description}</p>
//             </div>

//             <div className="coinForge_priceTag">
//                 <span className="coinForge_currency">Rs</span>
//                 <span className="coinForge_amount">{price.toLocaleString()}</span>
//             </div>

//             <div className="coinForge_selectionIndicator">
//                 {isSelected ? '✓ Selected' : 'Select Plan'}
//             </div>
//         </div>
//     );
// };

// export default PricingCard;
import React from 'react';

/**
 * PricingCard - A premium card for displaying coin packages.
 * Uses unique classNames for styling clarity.
 */
const PricingCard = ({ plan, onSelect, isSelected }) => {
    const { coins, description, bestValue } = plan;

    return (
        <div
            className={`coinForge_card ${isSelected ? 'coinForge_card--selected' : ''} ${bestValue ? 'coinForge_card--bestValue' : ''}`}
            onClick={() => onSelect(plan)}
        >
            {bestValue && <div className="coinForge_badge">BEST VALUE</div>}

            <div className="coinForge_iconWrap">
                <div className="coinForge_glow" />
                <span className="coinForge_icon">💎</span>
            </div>

            <div className="coinForge_content">
                <h3 className="coinForge_title">{coins} Coins</h3>
                <p className="coinForge_subTitle">{description}</p>
            </div>

            {/* <div className="coinForge_priceTag">
                <span className="coinForge_currency">Rs</span>
                <span className="coinForge_amount">{price.toLocaleString()}</span>
            </div> */}
            {/* 
            <div className="coinForge_selectionIndicator">
                {isSelected ? '✓ Selected' : 'Select Plan'}
            </div> */}
        </div>
    );
};

export default PricingCard;