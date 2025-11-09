/**
 * API Utility Functions
 * Handles authenticated API requests with proper token management
 */

import { API_BASE_URL } from '../config/api';

/**
 * Get the authentication token from localStorage
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem('token');
};

/**
 * Get default headers for API requests
 * Includes Authorization header if token exists
 */
export const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

/**
 * Make an authenticated GET request
 */
export const authenticatedGet = async (endpoint: string): Promise<Response> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  return fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
};

/**
 * Make an authenticated POST request
 */
export const authenticatedPost = async (
  endpoint: string,
  body?: any
): Promise<Response> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  return fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
};

/**
 * Make an authenticated PUT request
 */
export const authenticatedPut = async (
  endpoint: string,
  body?: any
): Promise<Response> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  return fetch(url, {
    method: 'PUT',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
};

/**
 * Make an authenticated DELETE request
 */
export const authenticatedDelete = async (endpoint: string): Promise<Response> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  return fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
};

/**
 * Handle API errors consistently
 */
export const handleApiError = async (response: Response): Promise<never> => {
  let errorMessage = `API Error: ${response.status}`;
  
  try {
    const data = await response.json();
    errorMessage = data.message || data.error || errorMessage;
  } catch {
    // If response is not JSON, use status text
    errorMessage = response.statusText || errorMessage;
  }
  
  throw new Error(errorMessage);
};
