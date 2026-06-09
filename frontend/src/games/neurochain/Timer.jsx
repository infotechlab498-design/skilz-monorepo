import React, { useEffect, useState } from 'react';

/**
 * @param {{ endsAt: import('firebase/firestore').Timestamp | null, onExpire?: () => void }} props
 */
export default function Timer({ endsAt, onExpire }) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!endsAt?.toMillis) {
      setLeft(0);
      return undefined;
    }
    const tick = () => {
      const ms = endsAt.toMillis() - Date.now();
      const s = Math.max(0, Math.ceil(ms / 1000));
      setLeft(s);
      if (ms <= 0 && onExpire) onExpire();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt, onExpire]);

  return (
    <div className="nc-timer" aria-live="polite">
      <span className="nc-timer__label">Time</span>
      <span className={left <= 5 ? 'nc-timer__value nc-timer__value--warn' : 'nc-timer__value'}>{left}s</span>
    </div>
  );
}
