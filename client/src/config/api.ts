// API Configuration - Centralized
export const API_CONFIG = {
  BASE_URL: window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
} as const;

// Export API_BASE_URL for backward compatibility with existing code
export const API_BASE_URL = API_CONFIG.BASE_URL;

// Simple fetch helper for now (can upgrade to axios later)
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  
  const config: RequestInit = {
    ...options,
    credentials: 'include', // Always include cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    return response;
  } catch (error) {
    throw error;
  }
};
