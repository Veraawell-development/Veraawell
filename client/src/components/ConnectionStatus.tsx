import React from 'react';
import { useDataSocket } from '../hooks/useDataSocket';

const ConnectionStatus: React.FC = () => {
    const { isConnected, isReconnecting } = useDataSocket();

    // Don't show anything when connected
    if (isConnected && !isReconnecting) {
        return null;
    }

    return (
        <div className="fixed top-20 right-4 z-50">
            {isReconnecting ? (
                <div className="bg-yellow-500 text-white rounded-full px-3 py-1 shadow-lg flex items-center gap-2 text-xs font-medium">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                    <span>Reconnecting...</span>
                </div>
            ) : !isConnected ? (
                <div className="bg-red-500 text-white rounded-full px-3 py-1 shadow-lg flex items-center gap-2 text-xs font-medium">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span>Offline</span>
                </div>
            ) : null}
        </div>
    );
};

export default ConnectionStatus;
