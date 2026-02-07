/**
 * Test Page for Data Socket Connection
 * Temporary page to verify data socket infrastructure is working
 */

import React, { useEffect, useState } from 'react';
import { useDataSocket } from '../hooks/useDataSocket';

const DataSocketTest: React.FC = () => {
    const { socket, isConnected, error } = useDataSocket();
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 20));
    };

    useEffect(() => {
        if (isConnected) {
            addLog('✅ Connected to data socket');
        } else if (error) {
            addLog(`❌ Error: ${error}`);
        }
    }, [isConnected, error]);

    useEffect(() => {
        if (!socket) return;

        // Test ping/pong
        socket.on('pong', (data) => {
            addLog(`🏓 Pong received: ${JSON.stringify(data)}`);
        });

        // Listen for test events
        socket.on('test:event', (data) => {
            addLog(`📨 Test event received: ${JSON.stringify(data)}`);
        });

        return () => {
            socket.off('pong');
            socket.off('test:event');
        };
    }, [socket]);

    const sendPing = () => {
        if (socket) {
            socket.emit('ping');
            addLog('🏓 Ping sent');
        }
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'monospace' }}>
            <h1>Data Socket Test Page</h1>

            <div style={{ marginBottom: '20px' }}>
                <h2>Connection Status</h2>
                <div style={{
                    padding: '10px',
                    background: isConnected ? '#d4edda' : '#f8d7da',
                    border: `1px solid ${isConnected ? '#c3e6cb' : '#f5c6cb'}`,
                    borderRadius: '4px'
                }}>
                    {isConnected ? (
                        <span style={{ color: '#155724' }}>✅ Connected (Socket ID: {socket?.id})</span>
                    ) : error ? (
                        <span style={{ color: '#721c24' }}>❌ Error: {error}</span>
                    ) : (
                        <span style={{ color: '#856404' }}>⏳ Connecting...</span>
                    )}
                </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <h2>Actions</h2>
                <button
                    onClick={sendPing}
                    disabled={!isConnected}
                    style={{
                        padding: '10px 20px',
                        background: isConnected ? '#007bff' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isConnected ? 'pointer' : 'not-allowed'
                    }}
                >
                    Send Ping
                </button>
            </div>

            <div>
                <h2>Event Logs</h2>
                <div style={{
                    background: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    padding: '10px',
                    maxHeight: '400px',
                    overflowY: 'auto'
                }}>
                    {logs.length === 0 ? (
                        <div style={{ color: '#6c757d' }}>No events yet...</div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} style={{ padding: '4px 0', borderBottom: '1px solid #e9ecef' }}>
                                {log}
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div style={{ marginTop: '20px', padding: '10px', background: '#e7f3ff', borderRadius: '4px' }}>
                <h3>Instructions:</h3>
                <ol>
                    <li>If connected, you should see a green status above</li>
                    <li>Click "Send Ping" to test bidirectional communication</li>
                    <li>Check browser console for detailed logs</li>
                    <li>Check server logs for connection messages</li>
                </ol>
            </div>
        </div>
    );
};

export default DataSocketTest;
