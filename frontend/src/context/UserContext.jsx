import React, { createContext, useContext, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setUser } from '../redux/features/auth.jsx';
import { getJwtUserId } from '../utils/gameAuthSync.js';
import { getUser, toSerializableFirebase } from '../services/userService.js';
import { callUpdateGameStats } from '../api/cloudFunctionsApi.js';

const UserContext = createContext();

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error('useUser must be used within a UserProvider');
    return context;
};

export const UserProvider = ({ children }) => {
    const dispatch = useDispatch();
    const { user: authUser, isAuthenticated, loading } = useSelector((state) => state.auth);
    const [activeRoomId, setActiveRoomId] = useState(null);

    const userId = authUser?.uid || getJwtUserId();

    const refreshUser = useCallback(async () => {
        if (!userId) return;
        try {
            const data = await getUser(userId);
            if (data) {
                dispatch(setUser(toSerializableFirebase(data)));
            }
        } catch (e) {
            console.error('refreshUser failed', e);
        }
    }, [userId, dispatch]);

    const deductCoins = useCallback(async (amount) => {
        if (!userId) throw new Error('Not signed in');
        await callUpdateGameStats({ coinsDelta: -Math.abs(Number(amount) || 0), xpDelta: 0 });
        await refreshUser();
        const data = await getUser(userId);
        return data?.coins ?? 0;
    }, [userId, refreshUser]);

    const value = {
        user: authUser,
        loading,
        isAuthenticated,
        userId,
        activeRoomId,
        setActiveRoomId,
        refreshUser,
        deductCoins
    };

    return (
        <UserContext.Provider value={value}>
            {children}
        </UserContext.Provider>
    );
};
















// import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// import { api } from '../services/api';
// const UserContext = createContext();
// export const useUser = () => {
//     const context = useContext(UserContext);
//     if (!context) throw new Error('useUser must be used within a UserProvider');
//     return context;
// };
// export const UserProvider = ({ children }) => {
//     const [user, setUser] = useState(null);
//     const [loading, setLoading] = useState(true);
//     // Mock Global User ID
//     const userId = 'user_1';
//     const refreshUser = useCallback(async () => {
//         const storedUser = localStorage.getItem('user');
//         if (!storedUser) {
//             setUser(null);
//             setLoading(false);
//             return;
//         }
//         try {
//             const data = await api.getUser(userId);
//             const parsedUser = JSON.parse(storedUser);
//             const data = await api.getUser(parsedUser.id);
//             setUser(data);
//             // Sync local storage with latest data
//             localStorage.setItem('user', JSON.stringify(data));
//         } catch (error) {
//             console.error('Failed to fetch global user:', error);
//             console.error('Failed to fetch user:', error);
//             // If fetching fails, we keep the last known good user from storage
//             setUser(JSON.parse(storedUser));
//         } finally {
//             setLoading(false);
//         }
//     }, [userId]);
//     }, []);
//     useEffect(() => {
//         refreshUser();
//     }, [refreshUser]);
//     const updateCoins = async (amount) => {
//         // This is typically called after a successful checkout
//     const logout = () => {
//         localStorage.removeItem('user');
//         setUser(null);
//     };
//     const updateCoins = async () => {
//         await refreshUser();
//     };
//     const deductCoins = async (amount) => {
//         if (!user || user.coins < amount) {
//             throw new Error('Insufficient coins');
//         }
//         try {
//             const response = await fetch('/api/user/deduct', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({ userId, amount })
//                 body: JSON.stringify({ userId: user.id, amount })
//             });
//             if (!response.ok) {
//                 const errorData = await response.json();
//                 throw new Error(errorData.message || 'Deduction failed');
//             }
//             await refreshUser();
//             return true;
//         } catch (error) {
//             console.error('Coin deduction error:', error);
//             throw error;
//         }
//     };
//     const value = {
//         user,
//         loading,
//         refreshUser,
//         updateCoins,
//         deductCoins,
//         userId
//         logout,
//         userId: user?.id
//     };
//     return (
//         <UserContext.Provider value={value}>
//             {children}
//         </UserContext.Provider>
//     );
// };