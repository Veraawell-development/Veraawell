import { API_BASE_URL } from '../config/api';

/**
 * Wake up the backend server (for Render free tier that sleeps after inactivity)
 * This pings the health endpoint to start the server before making actual requests
 */
export const wakeUpBackend = async (): Promise<boolean> => {
  try {
    console.log('🔄 Waking up backend server...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
      // Don't send credentials for health check
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log('✅ Backend server is awake!');
      return true;
    } else {
      console.warn('⚠️ Backend health check returned non-OK status:', response.status);
      return false;
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('❌ Backend wake up timed out after 60 seconds');
    } else {
      console.error('❌ Error waking up backend:', error.message);
    }
    return false;
  }
};

/**
 * Retry a fetch request with exponential backoff
 * Useful for handling cold starts and network issues
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<Response> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt + 1}/${maxRetries} for ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout per attempt
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // If successful, return immediately
      if (response.ok || response.status < 500) {
        return response;
      }
      
      // Server error, retry
      console.warn(`⚠️ Server error ${response.status}, retrying...`);
      lastError = new Error(`Server returned ${response.status}`);
      
    } catch (error: any) {
      lastError = error;
      
      if (error.name === 'AbortError') {
        console.error(`❌ Request timed out on attempt ${attempt + 1}`);
      } else {
        console.error(`❌ Request failed on attempt ${attempt + 1}:`, error.message);
      }
    }
    
    // Wait before retrying (exponential backoff)
    if (attempt < maxRetries - 1) {
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All retries failed
  throw lastError || new Error('All retry attempts failed');
};

/**
 * Check if the backend is accessible
 * Returns true if backend is reachable, false otherwise
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
};
