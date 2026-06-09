import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import app from './config.js';

const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';

export const functions = getFunctions(app, region);

if (import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
