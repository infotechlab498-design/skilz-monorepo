import { configureStore } from '@reduxjs/toolkit';
import authReducer from './features/auth.jsx';
import userReducer from './features/userSlice.js';
import gameReducer from './features/gameSlice.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    game: gameReducer,
  },
})
