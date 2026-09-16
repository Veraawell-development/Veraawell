/**
 * useDataSocket Hook
 *
 * A thin read of DataSocketContext. The connection logic moved there so the
 * app opens ONE /data socket instead of one per calling component, and so it
 * is dialled only after auth resolves — see the docblock in
 * context/DataSocketContext.tsx for the failure this fixed.
 *
 * The return shape is unchanged, so every existing consumer works as before.
 */

import { Socket } from 'socket.io-client';
import { useDataSocketContext } from '../context/DataSocketContext';

interface UseDataSocketReturn {
    socket: Socket | null;
    isConnected: boolean;
    isReconnecting: boolean;
    error: string | null;
}

export const useDataSocket = (): UseDataSocketReturn => useDataSocketContext();

/**
 * Example usage:
 *
 * const { socket, isConnected } = useDataSocket();
 *
 * useEffect(() => {
 *   if (!socket) return;
 *   const onChange = (data) => console.log('Doctor status changed:', data);
 *   socket.on('doctor:status-change', onChange);
 *   return () => {
 *     // Always pass the handler reference: a bare socket.off(event) removes
 *     // every listener for that event, including other components'.
 *     socket.off('doctor:status-change', onChange);
 *   };
 * }, [socket]);
 */
