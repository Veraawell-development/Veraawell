/**
 * Centralized API Configuration
 * Works across all environments: localhost, Vercel, and veraawell.com
 */

// Determine the environment and set appropriate URLs
const getApiBaseUrl = (): string => {
  // Check if we're in development (localhost)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5001/api';
  }
  
  // Production environment (Vercel or veraawell.com)
  return 'https://veraawell-backend.onrender.com/api';
};

const getSocketUrl = (): string => {
  // Check if we're in development (localhost)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5001';
  }
  
  // Production environment (Vercel or veraawell.com)
  return 'https://veraawell-backend.onrender.com';
};

// Export the URLs
export const API_BASE_URL = getApiBaseUrl();
export const SOCKET_URL = getSocketUrl();

// Helper function to build full API endpoint
export const buildApiUrl = (endpoint: string): string => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_BASE_URL}/${cleanEndpoint}`;
};

// Log current configuration (only in development)
if (window.location.hostname === 'localhost') {
  console.log('🔧 API Configuration:', {
    hostname: window.location.hostname,
    API_BASE_URL,
    SOCKET_URL,
  });
}
