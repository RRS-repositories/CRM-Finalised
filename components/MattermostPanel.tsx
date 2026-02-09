import React, { useEffect, useState } from 'react';
import { useCRM } from '../context/CRMContext';

const MATTERMOST_URL = 'https://chat.rowanroseclaims.co.uk';
const MM_USER_KEY = 'mattermostUserId';

const MattermostPanel: React.FC = () => {
  const { currentUser } = useCRM();
  const [phase, setPhase] = useState<'init' | 'logout' | 'ready'>('init');
  const [key, setKey] = useState(Date.now());

  useEffect(() => {
    if (!currentUser) return;

    const lastMmUser = localStorage.getItem(MM_USER_KEY);

    // If different user, force logout sequence
    if (lastMmUser && lastMmUser !== currentUser.id) {
      setPhase('logout');
      setKey(Date.now());

      // Wait for logout iframe to clear session, then load fresh
      const timer = setTimeout(() => {
        localStorage.setItem(MM_USER_KEY, currentUser.id);
        setPhase('ready');
        setKey(Date.now());
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      localStorage.setItem(MM_USER_KEY, currentUser.id);
      setPhase('ready');
    }
  }, [currentUser?.id]);

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <p className="text-gray-500">Please log in to access Mattermost</p>
      </div>
    );
  }

  // Show logout page in iframe to clear cookies
  if (phase === 'logout') {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-900">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <p className="text-blue-700 dark:text-blue-300 font-medium">
              Switching Mattermost account... Please wait.
            </p>
          </div>
        </div>
        <iframe
          key={key}
          src={MATTERMOST_URL + '/logout'}
          className="flex-1 border-0"
          title="Mattermost Logout"
        />
      </div>
    );
  }

  if (phase === 'init') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <iframe
      key={key}
      src={MATTERMOST_URL}
      className="w-full h-full border-0"
      title="Mattermost Chat"
      allow="camera; microphone; display-capture; fullscreen"
    />
  );
};

export default MattermostPanel;
