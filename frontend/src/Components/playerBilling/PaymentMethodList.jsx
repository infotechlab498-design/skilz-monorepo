import React from 'react';
import { Pencil } from 'lucide-react';
import { formatMaskedCard } from '../../api/playerBillingApi.js';

/**
 * @param {{
 *   cards: Array<{ id: string, last4?: string, cardType?: string }>,
 *   onAdd: () => void,
 *   onEdit: (card: { id: string }) => void,
 * }}
 */
export default function PaymentMethodList({ cards, onAdd, onEdit }) {
  return (
    <section className="pb-panel" aria-labelledby="pb-payment-title">
      <div className="pb-panel__head">
        <h2 className="pb-panel__title" id="pb-payment-title">
          Payment method
        </h2>
        <button type="button" className="pb-btn pb-btn--navy" onClick={onAdd}>
          Add new card
        </button>
      </div>
      {cards.length === 0 ? (
        <p className="player-billing-page__empty">No saved cards yet. Add one to get started.</p>
      ) : (
        cards.map((c) => (
          <div key={c.id} className="pb-pay-row">
            <div className="pb-pay-row__left">
              <div className="pb-pay-row__logo">{String(c.cardType || 'CARD').slice(0, 4)}</div>
              <span className="pb-pay-row__num">{formatMaskedCard(c.last4)}</span>
            </div>
            <button
              type="button"
              className="pb-btn pb-btn--ghost"
              aria-label={`Edit card ending ${c.last4}`}
              onClick={() => onEdit(c)}
            >
              <Pencil size={18} />
            </button>
          </div>
        ))
      )}
    </section>
  );
}
