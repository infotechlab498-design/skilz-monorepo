import React, { useMemo, useState } from 'react';
import { api } from '../services/api';
import { normalizeNewsletterEmail } from '../utils/emailNormalizer';

const EMAIL_REGEX =
  /^(?=.{1,254}$)(?=.{1,64}@)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export default function NewsletterSubscribe() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const disabled = useMemo(() => status === 'loading' || status === 'success', [status]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (status === 'loading') return;

    const normalized = normalizeNewsletterEmail(email);
    if (!EMAIL_REGEX.test(normalized)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const response = await api.subscribeNewsletter(normalized);
      setStatus('success');
      setMessage(response?.message || 'Subscribed successfully');
      setEmail('');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Error joining. Please try again later.');
    }
  };

  return (
    <form className="form-container" onSubmit={onSubmit}>
      <input
        type="email"
        className="email-input"
        placeholder="Enter email address"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        disabled={disabled}
      />
      <button type="submit" className={`cta-button ${status === 'success' ? 'success' : ''}`} disabled={disabled}>
        {status === 'loading' ? 'Sending...' : status === 'success' ? 'Joined!' : 'Continue'}
      </button>
      <div className="status-area">
        {status === 'success' && <p className="status success animate-in">✓ {message}</p>}
        {status === 'error' && <p className="status error animate-in">{message}</p>}
      </div>
    </form>
  );
}
