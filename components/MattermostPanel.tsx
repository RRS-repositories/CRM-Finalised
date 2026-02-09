import React, { useEffect, useState } from 'react';
import { useCRM } from '../context/CRMContext';

const MATTERMOST_URL = 'https://chat.rowanroseclaims.co.uk';
const MATTERMOST_LOGOUT_URL = 'https://chat.rowanroseclaims.co.uk/logout';
const MM_USER_KEY = 'mattermostUserId';

const MattermostPanel: React.FC = () => {
  const { currentUser } = useCRM();
  const [status, setStatus] = useState<'checking' | 'logging_out' | 'ready'>('checking');
  const [iframeUrl, setIframeUrl] = useState('');

  useEffect(() => {
    if (!currentUser) return;

    const lastMmUser = localStorage.getItem(MM_USER_KEY);

    // If different user was logged into Mattermost, force logout first
    if (lastMmUser && lastMmUser !== currentUser.id) {
      setStatus('logging_out');
      setIframeUrl(MATTERMOST_LOGOUT_URL);

      // After logout, load fresh Mattermost
      const timer = setTimeout(() => {
        localStorage.setItem(MM_USER_KEY, currentUser.id);
        setIframeUrl(MATTERMOST_URL + '?t=' + Date.now());
        setStatus('ready');
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      // Same user or first time - just load Mattermost
      localStorage.setItem(MM_USER_KEY, currentUser.id);
      setIframeUrl(MATTERMOST_URL);
      setStatus('ready');
    }
  }, [currentUser?.id]);

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <p className="text-gray-500">Please log in to access Mattermost</p>
      </div>
    );
  }

  if (status === 'checking' || status === 'logging_out') {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-900">
        {/* Hidden iframe to perform logout */}
        {status === 'logging_out' && iframeUrl && (
          <iframe src={iframeUrl} className="hidden" title="Logout" />
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">
              {status === 'logging_out' ? 'Switching account...' : 'Loading...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={currentUser.id + iframeUrl}
      src={iframeUrl}
      className="w-full h-full border-0"
      title="Mattermost Chat"
      allow="camera; microphone; display-capture; fullscreen"
    />
  );
};

export default MattermostPanel;
