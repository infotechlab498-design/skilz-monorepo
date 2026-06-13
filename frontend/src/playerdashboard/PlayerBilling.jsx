import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import '../Components/playerBilling/playerBilling.css';
import BillingCard from '../Components/playerBilling/BillingCard.jsx';
import StatsCard from '../Components/playerBilling/StatsCard.jsx';
import PaymentMethodList from '../Components/playerBilling/PaymentMethodList.jsx';
import BillingHistory from '../Components/playerBilling/BillingHistory.jsx';
import AddCardModal from '../Components/playerBilling/AddCardModal.jsx';
import {
  addCard,
  getBillingSnapshot,
  getCards,
  updateCard,
} from '../api/playerBillingApi.js';
import { useRequireBillingProfile } from '../hooks/useBillingAccess.js';

function formatSpend(n) {
  const x = Number(n) || 0;
  const sign = x >= 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x)}`;
}

function formatCoins(n) {
  return Number(n || 0).toLocaleString('en-US');
}

const PlayerBilling = () => {
  const user = useSelector((s) => s.auth.user);
  const { firebaseReady, allowed } = useRequireBillingProfile('/player/billing');
  const uid = user?.uid || null;

  const [cards, setCards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({ totalSpent: 0, totalCoins: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid) {
      setCards([]);
      setTransactions([]);
      setStats({ totalSpent: 0, totalCoins: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [c, billing] = await Promise.all([getCards(uid), getBillingSnapshot(uid)]);
      setCards(c);
      setTransactions(billing.transactions);
      setStats({
        totalSpent: Number(billing.stats.totalSpent) || 0,
        totalCoins: Number(billing.stats.totalCoins) || 0,
      });
    } catch (e) {
      console.error('[PlayerBilling]', e);
      setError(e?.message || 'Could not load billing data. Check Firestore rules and network.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (!firebaseReady) return;
    refresh();
  }, [firebaseReady, refresh]);

  const primaryCard = useMemo(() => (cards.length ? cards[0] : null), [cards]);

  const openAdd = useCallback(() => {
    setEditingCard(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((card) => {
    setEditingCard(card);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (saveBusy) return;
    setModalOpen(false);
    setEditingCard(null);
  }, [saveBusy]);

  const handleSubmitCard = useCallback(
    async (form) => {
      if (!uid) return;
      setSaveBusy(true);
      setError(null);
      try {
        if (editingCard?.id) {
          await updateCard(
            editingCard.id,
            {
              cardHolderName: form.cardHolderName,
              cardNumber: form.cardNumber,
              expiryDate: form.expiryDate,
              cardType: form.cardType,
            },
            uid
          );
        } else {
          await addCard({
            userId: uid,
            cardHolderName: form.cardHolderName,
            cardNumber: form.cardNumber,
            expiryDate: form.expiryDate,
            cardType: form.cardType,
          });
        }
        setModalOpen(false);
        setEditingCard(null);
        await refresh();
      } catch (e) {
        console.error('[PlayerBilling] save card', e);
        setError(e?.message || 'Could not save card.');
      } finally {
        setSaveBusy(false);
      }
    },
    [uid, editingCard, refresh]
  );

  if (!firebaseReady || !allowed) {
    return (
      <div className="player-billing-page">
        <div className="player-billing-page__loading" role="status" aria-live="polite">
          {firebaseReady ? 'Redirecting to profile…' : 'Loading session…'}
        </div>
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="player-billing-page">
        <div className="player-billing-page__crumb">
          Pages / <span>Billing</span>
        </div>
        <h1 className="player-billing-page__title">Billing</h1>
        <div className="player-billing-page__alert player-billing-page__alert--info">
          Sign in to view your billing, saved cards, and purchase history.
        </div>
      </div>
    );
  }

  return (
    <div className="player-billing-page">
      <div className="player-billing-page__crumb">
        Pages / <span>Billing</span>
      </div>
      <h1 className="player-billing-page__title">Billing</h1>

      {error ? (
        <div className="player-billing-page__alert player-billing-page__alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="player-billing-page__grid-top">
        <BillingCard card={primaryCard} loading={loading} />
        <div className="player-billing-page__stats-col">
          <StatsCard label="Total spend" value={loading ? '…' : formatSpend(stats.totalSpent)} />
          <StatsCard label="Coins earned" value={loading ? '…' : formatCoins(stats.totalCoins)} tone="earn" />
        </div>
      </div>

      <PaymentMethodList cards={cards} onAdd={openAdd} onEdit={openEdit} />

      <BillingHistory transactions={transactions} />

      <AddCardModal
        open={modalOpen}
        onClose={closeModal}
        onSubmit={handleSubmitCard}
        editing={editingCard}
        busy={saveBusy}
      />
    </div>
  );
};

export default PlayerBilling;
