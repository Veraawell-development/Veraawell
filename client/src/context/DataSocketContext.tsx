/**
 * One /data socket for the whole app, dialled only once auth is known.
 *
 * WHY THIS REPLACED A PER-COMPONENT HOOK
 *
 * useDataSocket used to open its own connection inside `useEffect(..., [])`,
 * reading the token once at mount:
 *
 *     const token = getAuthToken();
 *     io(`${SOCKET_URL}/data`, { auth: { token }, ... })
 *
 * That token lives in memory only (utils/authToken.ts) and is deliberately not
 * persisted, so it is `null` on every page load and is filled in
 * asynchronously by AuthContext.checkAuth(). GlobalIncomingCallListener mounts
 * at the App root, well before that resolves, so it handed the server
 * `token: undefined` and depended entirely on the cross-site cookie
 * (veraawell.com -> api.veraawell.com). The empty dependency array meant it
 * never re-dialled once the real token arrived, and the connect_error handler
 * gives up permanently on anything matching /Authentication|No token/ — so a
 * doctor whose browser blocks that third-party cookie, which authToken.ts's
 * own docblock warns Safari's ITP does, had no realtime layer at all for the
 * rest of the session. No ring, no incoming call, nothing.
 *
 * Connecting from a provider keyed on auth state fixes both halves: nothing is
 * dialled until there is a user to dial for, and the connection is rebuilt
 * when that user changes. Seven components shared this hook and each opened
 * its own socket; they now share one.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import { getAuthToken } from '../utils/authToken';
import { useAuth } from './AuthContext';

interface DataSocketValue {
  socket: Socket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
}

const DataSocketContext = createContext<DataSocketValue>({
  socket: null,
  isConnected: false,
  isReconnecting: false,
  error: null
});

const MAX_RECONNECT_ATTEMPTS = 5;

export const DataSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, user, loading } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    // Wait for checkAuth() to settle. Dialling during the unknown window is
    // what produced the null-token handshake in the first place.
    if (loading || !isLoggedIn) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const next = io(`${SOCKET_URL}/data`, {
      auth: { token: getAuthToken() },
      withCredentials: true, // the httpOnly cookie is still the primary credential
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
    });

    next.on('connect', () => {
      setIsConnected(true);
      setIsReconnecting(false);
      setError(null);
      attempts.current = 0;
    });

    next.on('connect_error', (err) => {
      console.error('[DATA-SOCKET] Connection error:', err.message);
      setError(err.message);
      setIsConnected(false);

      // Retrying a rejected credential just burns attempts — but unlike
      // before, this is no longer terminal for the session: the effect
      // re-runs and re-dials with a fresh token whenever auth changes.
      if (/Authentication error|No token/.test(err.message)) {
        next.disconnect();
        return;
      }

      attempts.current += 1;
      if (attempts.current >= MAX_RECONNECT_ATTEMPTS) {
        setIsReconnecting(false);
        next.disconnect();
      }
    });

    next.on('disconnect', (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') next.connect();
    });

    next.on('reconnect_attempt', () => setIsReconnecting(true));

    next.on('reconnect', () => {
      setIsConnected(true);
      setIsReconnecting(false);
      setError(null);
      attempts.current = 0;
    });

    next.on('reconnect_failed', () => {
      setError('Failed to reconnect to server');
      setIsReconnecting(false);
    });

    setSocket(next);

    return () => {
      next.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
    // user.userId, not the user object: AuthContext hands back a fresh object
    // on every check, which would tear the socket down on a timer.
  }, [loading, isLoggedIn, user?.userId]);

  return (
    <DataSocketContext.Provider value={{ socket, isConnected, isReconnecting, error }}>
      {children}
    </DataSocketContext.Provider>
  );
};

export const useDataSocketContext = (): DataSocketValue => useContext(DataSocketContext);
