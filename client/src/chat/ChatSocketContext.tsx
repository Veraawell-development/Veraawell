import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { getAuthToken } from '../utils/authToken';

/**
 * One /chat socket for the whole app, while signed in.
 *
 * The Messages page and each in-call chat used to open their own, with
 * different options: the page's gave up after five attempts, and — sharing
 * the /data socket's connection on a first visit but not on later ones —
 * behaved differently depending on how you got there. A server that was busy
 * or restarting turned it away for good (socket.io doesn't retry a refused
 * handshake), and chat silently stopped until a reload.
 *
 * Now: its own connection, reconnecting forever, retrying a busy server, with
 * the current token on every attempt. `reconnects` counts reconnections, so a
 * thread can catch up on what it missed.
 */

interface ChatSocketValue {
  socket: Socket | null;
  connected: boolean;
  /** Bumps on every reconnection after the first connection. */
  reconnects: number;
}

const ChatSocketContext = createContext<ChatSocketValue>({ socket: null, connected: false, reconnects: 0 });

export const ChatSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, loading, user } = useAuth();
  const [value, setValue] = useState<ChatSocketValue>({ socket: null, connected: false, reconnects: 0 });

  useEffect(() => {
    if (loading || !isLoggedIn || !user || (user.role !== 'patient' && user.role !== 'doctor')) {
      setValue({ socket: null, connected: false, reconnects: 0 });
      return;
    }
    let closed = false;
    let everConnected = false;
    let attempts = 0;
    const socket = io(`${SOCKET_URL}/chat`, {
      auth: (cb) => cb({ token: getAuthToken() }),
      withCredentials: true,
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    setValue({ socket, connected: false, reconnects: 0 });

    socket.on('connect', () => {
      attempts = 0;
      const again = everConnected;
      everConnected = true;
      setValue((v) => ({ socket, connected: true, reconnects: again ? v.reconnects + 1 : v.reconnects }));
    });
    socket.on('disconnect', (reason) => {
      setValue((v) => ({ ...v, connected: false }));
      if (reason === 'io server disconnect' && !closed) setTimeout(() => { if (!closed && !socket.connected) socket.connect(); }, 1000 + Math.random() * 2000);
    });
    socket.on('connect_error', (err: Error & { data?: { retryable?: boolean } }) => {
      setValue((v) => ({ ...v, connected: false }));
      if (/Authentication error|No token/.test(err.message)) return; // signed out: AuthContext takes over
      if (err.data?.retryable) {
        attempts += 1;
        setTimeout(() => { if (!closed && !socket.connected) socket.connect(); }, Math.min(10000, 1000 * attempts) + Math.random() * 1000);
      }
    });

    return () => {
      closed = true;
      socket.removeAllListeners();
      socket.disconnect();
      setValue({ socket: null, connected: false, reconnects: 0 });
    };
    // user?.userId, not the object: AuthContext hands out a fresh one on every check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLoggedIn, user?.userId, user?.role]);

  return <ChatSocketContext.Provider value={value}>{children}</ChatSocketContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useChatSocket = () => useContext(ChatSocketContext);
