import React from 'react';
import { formatMaskedCard } from '../../api/playerBillingApi.js';

/**
 * Hero credit card from primary saved card (or placeholder).
 * @param {{ card: { cardHolderName?: string, last4?: string, expiryDate?: string, cardType?: string } | null, loading?: boolean }}
 */
export default function BillingCard({ card, loading }) {
  const holder = card?.cardHolderName || 'Your name';
  const masked = card?.last4 ? formatMaskedCard(card.last4) : '•••• •••• •••• ••••';
  const exp = card?.expiryDate || '—/—';
  const brand = card?.cardType || 'Card';

  return (
    <div className="pb-billing-card" aria-label="Primary payment card preview">
      <div className="pb-billing-card__waves" aria-hidden />
      <div className="pb-billing-card__inner">
        <div>
          <div className="pb-billing-card__tap" aria-hidden />
          <div className="pb-billing-card__number">
            {loading ? '···· ···· ···· ····' : masked}
          </div>
        </div>
        <div className="pb-billing-card__row">
          <div>
            <div className="pb-billing-card__label">Card holder</div>
            <div className="pb-billing-card__value">{loading ? '…' : holder}</div>
          </div>
          <div>
            <div className="pb-billing-card__label">Expires</div>
            <div className="pb-billing-card__value">{loading ? '…' : exp}</div>
          </div>
          <div className="pb-billing-card__brand">{loading ? '…' : brand}</div>
        </div>
      </div>
    </div>
  );
}
