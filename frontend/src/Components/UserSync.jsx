import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { subscribeUserProfile } from '../services/userService.js';
import {
  buildUserStatePayloadFromUserDoc,
  clearUser,
  syncUserFromFirestore,
} from '../redux/features/userSlice.js';

/**
 * Headless component: real-time Firestore `users/{uid}` → Redux user slice
 * (coins, XP, profile, games, stats). Keeps UI in sync after Cloud Function writes.
 */
const UserSync = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) {
      dispatch(clearUser());
      return;
    }

    const unsubscribe = subscribeUserProfile(uid, (userRow) => {
      if (!userRow) return;
      const { id: rowId, ...dataWithoutId } = userRow;
      const docId = rowId || uid;
      dispatch(
        syncUserFromFirestore(buildUserStatePayloadFromUserDoc(docId, dataWithoutId))
      );
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [uid, dispatch]);

  return null;
};

export default UserSync;
