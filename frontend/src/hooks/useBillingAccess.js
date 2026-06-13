import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { useAuth } from './useAuth.js';
import {
  BILLING_PROFILE_PATH,
  isProfileBillingComplete,
} from '../utils/profileCompletion.js';

/**
 * Auth slice + Firestore profile merged for gate checks.
 */
export function useMergedPlayerProfile() {
  const authUser = useSelector((s) => s.auth.user);
  const profile = useSelector((s) => s.user.profile);
  return useMemo(
    () => ({
      ...(profile || {}),
      uid: profile?.uid || profile?.id || authUser?.uid || '',
      email: profile?.email || authUser?.email || '',
      username: profile?.username || authUser?.username || '',
      displayName:
        profile?.displayName ||
        profile?.fullName ||
        profile?.name ||
        authUser?.displayName ||
        '',
      phone: profile?.phone || profile?.phoneLocal || '',
      phoneLocal: profile?.phoneLocal || profile?.phone || '',
      cnic: profile?.cnic || '',
    }),
    [profile, authUser]
  );
}

/**
 * Redirect unauthenticated users to sign-in; billing-incomplete to profile page.
 * @param {string} [redirectTo] - sign-in return path when not authenticated
 */
export function useRequireBillingProfile(redirectTo = '/checkout') {
  const navigate = useNavigate();
  const { firebaseReady, isAuthenticated } = useAuth();
  const mergedProfile = useMergedPlayerProfile();
  const billingReady = isProfileBillingComplete(mergedProfile);

  useEffect(() => {
    if (!firebaseReady) return;
    if (!isAuthenticated) {
      navigate('/signin', { replace: true, state: { redirectTo } });
      return;
    }
    if (!billingReady) {
      navigate(BILLING_PROFILE_PATH, { replace: true });
    }
  }, [firebaseReady, isAuthenticated, billingReady, navigate, redirectTo]);

  return {
    firebaseReady,
    isAuthenticated,
    billingReady,
    profile: mergedProfile,
    allowed: firebaseReady && isAuthenticated && billingReady,
  };
}

/**
 * Click handler helper: sign-in → billing profile → checkout.
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {boolean} isAuthenticated
 * @param {Record<string, unknown> | null | undefined} profile
 */
export function navigateToCheckoutOrGate(navigate, isAuthenticated, profile) {
  if (!isAuthenticated) {
    navigate('/signin', { state: { redirectTo: '/checkout' } });
    return;
  }
  if (!isProfileBillingComplete(profile)) {
    navigate(BILLING_PROFILE_PATH);
    return;
  }
  navigate('/checkout');
}

/**
 * Toast with Recharge action (sonner-based lobbies).
 */
export function promptInsufficientCoinsRecharge(
  navigate,
  isAuthenticated,
  profile,
  entryFee
) {
  toast.error(`Insufficient coins! You need ${entryFee} coins to play.`, {
    icon: '💰',
    duration: 6000,
    action: {
      label: 'Recharge',
      onClick: () => navigateToCheckoutOrGate(navigate, isAuthenticated, profile),
    },
  });
}

/**
 * Confirm dialog fallback (legacy alert-based lobbies).
 */
export function alertInsufficientCoinsRecharge(
  navigate,
  isAuthenticated,
  profile,
  entryFee
) {
  const go = window.confirm(
    `Insufficient coins! You need ${entryFee} coins to play.\n\nGo to recharge now?`
  );
  if (go) navigateToCheckoutOrGate(navigate, isAuthenticated, profile);
}
