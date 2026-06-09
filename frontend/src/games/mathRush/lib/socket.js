import { socketService } from '../../../services/socketService.js';

function requireSocket() {
  const s = socketService.getSocket();
  if (!s) {
    throw new Error('Socket not initialized. Call connectSocket() first.');
  }
  return s;
}

export const socket = new Proxy(
  {},
  {
    get(_target, prop) {
      const s = requireSocket();
      const value = s[prop];
      return typeof value === 'function' ? value.bind(s) : value;
    },
  }
);

export const connectSocket = () => socketService.ensureConnected({ forceRefresh: false });

export const ensureSocketConnected = () => socketService.ensureConnected({ forceRefresh: false });

export const disconnectSocket = () => socketService.disconnect();

