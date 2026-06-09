import { useEffect, useState, useRef } from 'react';

import { ref as rdbRef, onValue } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { rtdb, firestore } from '../firebase/config';

export default function usePlayers(options = {}) {
  const { fallbackPlayers = [] } = options;

  const [players, setPlayers] = useState([]);
  const cacheRef = useRef({});

  useEffect(() => {
    // Graceful exit if Firebase is not yet configured or available
    if (!rtdb) {
      setPlayers(fallbackPlayers);
      return;
    }

    const presenceRef = rdbRef(rtdb, 'presence');

    const unsubscribe = onValue(
      presenceRef,


      async (snapshot) => {
        const presenceData = snapshot.val() || {};
        const entries = Object.entries(presenceData);

        // Filter online / in-game users

        const onlineUids = entries
          .filter(
            ([, data]) =>
              data &&
              (data.status === 'online' || data.status === 'in-game')
          )
          .map(([uid]) => uid);

        const playerPromises = onlineUids.map(async (uid) => {

          if (cacheRef.current[uid]) {
            return cacheRef.current[uid];
          }

          try {
            const userDoc = await getDoc(doc(firestore, 'publicProfiles', uid));
            const profile = userDoc.exists() ? userDoc.data() : null;

            const player = {
              uid,
              presence: presenceData[uid],
              profile,
            };

            cacheRef.current[uid] = player;
            return player;
          } catch {
            console.warn('Failed to load profile for', uid);
            return {
              uid,
              presence: presenceData[uid],
              profile: null,
            };
          }
        });

        const resolvedPlayers = await Promise.all(playerPromises);
        setPlayers(resolvedPlayers.length > 0 ? resolvedPlayers : fallbackPlayers);
      },


      // ON ERROR (PERMISSION / OFFLINE)

      () => {
        console.warn('RTDB presence unavailable, using fallback players');
        setPlayers(fallbackPlayers);
      }
    );

    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [fallbackPlayers]);

  return players;
}
