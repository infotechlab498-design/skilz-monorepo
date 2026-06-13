import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  navigateToCheckoutOrGate,
  useMergedPlayerProfile,
} from '../hooks/useBillingAccess.js';

/**
 * Shared CTA — routes through billing profile gate when phone/CNIC missing.
 */
export default function RechargeCoinsButton({
  className = '',
  label = 'Recharge coins',
  style,
}) {
  const navigate = useNavigate();
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);
  const mergedProfile = useMergedPlayerProfile();

  return (
    <button
      type="button"
      className={className || 'signup-btn'}
      style={style}
      onClick={() => navigateToCheckoutOrGate(navigate, isAuthenticated, mergedProfile)}
    >
      {label}
    </button>
  );
}
