import React from 'react';

function formatMoney(n) {
  const x = Number(n) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x);
}

function formatDate(ms) {
  if (!ms) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return '—';
  }
}

/**
 * @param {{ transactions: Array<{ id: string, date?: number, createdAt?: number, amountSpent?: number, coinsEarned?: number, paymentMethod?: string }> }}
 */
export default function BillingHistory({ transactions }) {
  const rows = transactions;

  return (
    <section className="pb-panel" aria-labelledby="pb-history-title">
      <div className="pb-panel__head">
        <h2 className="pb-panel__title" id="pb-history-title">
          Billing history
        </h2>
      </div>
      {rows.length === 0 ? (
        <p className="player-billing-page__empty">
          No transactions yet. Purchases and top-ups will appear here.
        </p>
      ) : (
        <div className="pb-table-wrap">
          <table className="pb-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Amount</th>
                <th scope="col">Coins purchased</th>
                <th scope="col">Payment method</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.date || t.createdAt)}</td>
                  <td>{formatMoney(t.amountSpent)}</td>
                  <td>{Number(t.coinsEarned || 0).toLocaleString('en-US')}</td>
                  <td>{t.paymentMethod || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
