import React from 'react';

export default function ContactPromoCard({ onBuildReport }) {
  return (
    <aside className="contactAdmin-promoCard" aria-label="Custom reports">
      <div className="contactAdmin-promoCardInner">
        <h3 className="contactAdmin-promoCardTitle">Need a Custom Report?</h3>
        <p className="contactAdmin-promoCardText">
          Generate advanced analytics for your support team response times.
        </p>
        <button type="button" className="contactAdmin-promoCardBtn" onClick={onBuildReport}>
          Build Report
        </button>
      </div>
      <div className="contactAdmin-promoCardArt" aria-hidden />
    </aside>
  );
}
