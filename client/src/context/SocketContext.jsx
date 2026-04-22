import { createContext, useState, useEffect, useCallback } from 'react';
import socket from '../lib/socket';

export const SocketContext = createContext(null);

/**
 * Provides socket instance and connection state to the entire app.
 * States: idle | connecting | connected | disconnected | error
 */
export function SocketProvider({ children }) {
  const [connectionState, setConnectionState] = useState('idle');
  const [isConnected, setIsConnected] = useState(false);

  const connectSocket = useCallback(() => {
    if (!socket.connected) {
      setConnectionState('connecting');
      socket.connect();
    }
  }, []);

  const disconnectSocket = useCallback(() => {
    if (socket.connected) {
      socket.disconnect();
    }
    setConnectionState('idle');
    setIsConnected(false);
  }, []);

  useEffect(() => {
    function onConnect() {
      setConnectionState('connected');
      setIsConnected(true);
    }

    function onDisconnect() {
      setConnectionState('disconnected');
      setIsConnected(false);
    }

    function onConnectError() {
      setConnectionState('error');
      setIsConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  const value = {
    socket,
    isConnected,
    connectionState,
    connectSocket,
    disconnectSocket,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}
