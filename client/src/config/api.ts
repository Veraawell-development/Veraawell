// API Configuration - Centralized
export const API_CONFIG = {
  BASE_URL: window.location.hostname === 'localhost'
    ? '/api'
    : 'https://api.veraawell.com/api',
  SOCKET_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:5001'
    : 'https://api.veraawell.com',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
} as const;

// Export API_BASE_URL for backward compatibility with existing code
export const API_BASE_URL = API_CONFIG.BASE_URL;
export const SOCKET_URL = API_CONFIG.SOCKET_URL;
