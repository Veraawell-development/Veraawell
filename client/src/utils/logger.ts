/**
 * Production-Ready Logger Utility
 * Only logs in development mode
 * Uses Vite's import.meta.env for environment detection
 */

// Vite automatically provides import.meta.env.DEV in development
// and import.meta.env.PROD in production
const isDevelopment = import.meta.env.DEV ?? true;

export const logger = {
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.log('[INFO]', ...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn('[WARN]', ...args);
    }
  },
  
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error('[ERROR]', ...args);
  },
  
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug('[DEBUG]', ...args);
    }
  }
};

export default logger;
