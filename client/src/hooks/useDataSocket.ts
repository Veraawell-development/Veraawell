/**
 * useDataSocket Hook
 * Reusable React hook for connecting to the data socket namespace
 * Handles authentication, connection state, and auto-reconnection
 */

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Determine API base URL
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001'
    : 'https://veraawell-backend.onrender.com';

interface UseDataSocketReturn {
    socket: Socket | null;
    isConnected: boolean;
    isReconnecting: boolean;
    error: string | null;
}

/**
 * Custom hook to connect to the data socket namespace
 * @returns {UseDataSocketReturn} Socket instance, connection state, reconnecting state, and error
 */
export const useDataSocket = (): UseDataSocketReturn => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 5;

    useEffect(() => {
        console.log('[DATA-SOCKET] Initializing connection...');

        // Create socket connection to /data namespace
        // Using cookie-based authentication (withCredentials: true)
        // The server will read the auth token from the HttpOnly cookie
        const newSocket = io(`${API_BASE_URL}/data`, {
            withCredentials: true,  // Send cookies with the request
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: maxReconnectAttempts
        });

        // Connection successful
        newSocket.on('connect', () => {
            console.log('[DATA-SOCKET] Connected successfully', {
                socketId: newSocket.id,
                timestamp: new Date().toISOString()
            });
            setIsConnected(true);
            setIsReconnecting(false);
            setError(null);
            reconnectAttempts.current = 0;
        });

        // Connection error
        newSocket.on('connect_error', (err) => {
            console.error('[DATA-SOCKET] Connection error:', err.message);
            setError(err.message);
            setIsConnected(false);
            reconnectAttempts.current++;

            if (reconnectAttempts.current >= maxReconnectAttempts) {
                console.error('[DATA-SOCKET] Max reconnection attempts reached');
                setIsReconnecting(false);
                newSocket.disconnect();
            }
        });

        // Disconnected
        newSocket.on('disconnect', (reason) => {
            console.log('[DATA-SOCKET] Disconnected:', reason);
            setIsConnected(false);

            // Auto-reconnect unless disconnected by client
            if (reason === 'io server disconnect') {
                // Server disconnected, manually reconnect
                newSocket.connect();
            }
        });

        // Reconnection attempt
        newSocket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`[DATA-SOCKET] Reconnection attempt ${attemptNumber}/${maxReconnectAttempts}`);
            setIsReconnecting(true);
        });

        // Reconnection successful
        newSocket.on('reconnect', (attemptNumber) => {
            console.log(`[DATA-SOCKET] Reconnected after ${attemptNumber} attempts`);
            setIsConnected(true);
            setIsReconnecting(false);
            setError(null);
            reconnectAttempts.current = 0;
        });

        // Reconnection failed
        newSocket.on('reconnect_failed', () => {
            console.error('[DATA-SOCKET] Reconnection failed after max attempts');
            setError('Failed to reconnect to server');
            setIsReconnecting(false);
        });

        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            console.log('[DATA-SOCKET] Cleaning up connection');
            newSocket.disconnect();
        };
    }, []); // Empty dependency array - only run once on mount

    return { socket, isConnected, isReconnecting, error };
};

/**
 * Example usage:
 * 
 * const { socket, isConnected } = useDataSocket();
 * 
 * useEffect(() => {
 *   if (!socket) return;
 * 
 *   socket.on('doctor:status-change', (data) => {
 *     console.log('Doctor status changed:', data);
 *   });
 * 
 *   return () => {
 *     socket.off('doctor:status-change');
 *   };
 * }, [socket]);
 */
