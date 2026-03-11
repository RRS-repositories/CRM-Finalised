import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessagesSquare, X } from 'lucide-react';
import { useCRM } from '../context/CRMContext';

const MATTERMOST_WS_URL = 'wss://chat.rowanroseclaims.co.uk/api/v4/websocket';
const MATTERMOST_API_URL = 'https://chat.rowanroseclaims.co.uk/api/v4';
const MAX_VISIBLE_TOASTS = 3;
const TOAST_DURATION_MS = 5000;

interface MmNotification {
  id: string;
  sender: string;
  message: string;
  channelName: string;
  isExiting: boolean;
}

const MattermostBubble: React.FC = () => {
  const { currentUser } = useCRM();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<MmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const myMmUserId = useRef<string | null>(null);
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authTime = useRef<number>(0);
  const mountedRef = useRef(true);
  const seqRef = useRef(1);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isExiting: true } : n)
    );
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 500);
  }, []);

  const addNotification = useCallback((sender: string, message: string, channelName: string) => {
    const id = `mm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Suppress toast popups when tab is hidden, but still count as unread
    if (document.visibilityState === 'hidden') {
      setUnreadCount(prev => prev + 1);
      return;
    }

    setNotifications(prev => {
      const updated = [...prev, { id, sender, message, channelName, isExiting: false }];
      // Cap at MAX_VISIBLE_TOASTS — remove oldest
      if (updated.length > MAX_VISIBLE_TOASTS) {
        return updated.slice(updated.length - MAX_VISIBLE_TOASTS);
      }
      return updated;
    });
    setUnreadCount(prev => prev + 1);

    // Auto-dismiss after TOAST_DURATION_MS
    setTimeout(() => {
      dismissNotification(id);
    }, TOAST_DURATION_MS);
  }, [dismissNotification]);

  const connect = useCallback(() => {
    const token = localStorage.getItem('mattermostToken');
    if (!token || !currentUser) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(MATTERMOST_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        authTime.current = Date.now();
        // Send authentication challenge
        ws.send(JSON.stringify({
          seq: seqRef.current++,
          action: 'authentication_challenge',
          data: { token }
        }));

        // Fetch current user's Mattermost ID for self-message filtering
        if (!myMmUserId.current) {
          fetch(`${MATTERMOST_API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${token}` }
          })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data?.id) myMmUserId.current = data.id;
            })
            .catch(() => {});
        }

        // Reset reconnect delay on successful connection
        reconnectDelay.current = 1000;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.event === 'posted' && msg.data) {
            const post = JSON.parse(msg.data.post);

            // Skip own messages
            if (myMmUserId.current && post.user_id === myMmUserId.current) return;

            const senderName = (msg.data.sender_name || '').replace(/^@/, '');
            const channelName = msg.data.channel_display_name || '';
            const messageText = post.message || '';

            if (senderName && messageText) {
              addNotification(senderName, messageText, channelName);
            }
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;

        if (!mountedRef.current) return;

        // If closed within 2s of auth, likely auth failure — stop reconnecting
        if (Date.now() - authTime.current < 2000 && authTime.current > 0) {
          console.warn('Mattermost WebSocket: auth failure, not reconnecting');
          return;
        }

        // Reconnect with exponential backoff
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, reconnectDelay.current);
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
      };

      ws.onerror = () => {
        // onclose will fire after this, handling reconnect
      };
    } catch {
      // WebSocket constructor failed
    }
  }, [currentUser, addNotification]);

  // WebSocket lifecycle
  useEffect(() => {
    mountedRef.current = true;

    if (currentUser) {
      connect();
    }

    const handleOnline = () => {
      if (currentUser && !wsRef.current) connect();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [currentUser, connect]);

  // Hide on /mattermost page or when not logged in
  if (!currentUser || location.pathname === '/mattermost') return null;

  const handleBubbleClick = () => {
    setUnreadCount(0);
    navigate('/mattermost');
  };

  const handleToastClick = (id: string) => {
    dismissNotification(id);
    setUnreadCount(0);
    navigate('/mattermost');
  };

  return (
    <>
      {/* Notification Toasts */}
      {notifications.length > 0 && (
        <div className="fixed bottom-24 right-6 z-[65] flex flex-col gap-3 pointer-events-none">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleToastClick(notif.id)}
              className={`
                pointer-events-auto cursor-pointer w-80 p-4 rounded-xl shadow-2xl border-l-4 border-blue-500
                bg-white dark:bg-surface-800 backdrop-blur-sm
                transition-all duration-500 transform
                ${notif.isExiting ? 'translate-x-full opacity-0' : 'animate-slide-in'}
                hover:shadow-xl hover:scale-[1.01]
              `}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 shrink-0">
                  <MessagesSquare size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {notif.sender}
                    {notif.channelName && (
                      <span className="font-normal text-gray-500 dark:text-gray-400 text-xs ml-1">
                        in {notif.channelName}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                    {notif.message}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismissNotification(notif.id); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Chat Bubble */}
      <button
        onClick={handleBubbleClick}
        className="fixed bottom-6 right-20 z-[60] w-13 h-13 rounded-full bg-brand-orange text-white shadow-2xl flex items-center justify-center hover:scale-110 transition-transform duration-200 hover:shadow-orange-500/25"
        title="Open Mattermost Chat"
      >
        <MessagesSquare size={24} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </>
  );
};

export default MattermostBubble;
