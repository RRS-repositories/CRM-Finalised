import React, { useEffect, useState, useRef } from 'react';
import { useCRM } from '../context/CRMContext';

const MATTERMOST_URL = 'https://chat.rowanroseclaims.co.uk';
const MATTERMOST_LOGOUT_URL = 'https://chat.rowanroseclaims.co.uk/logout';

const MattermostPanel: React.FC = () => {
  const { currentUser } = useCRM();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [iframeUrl, setIframeUrl] = useState(MATTERMOST_URL);
  const previousUserId = useRef<string | null>(null);

  // When user changes, force logout from Mattermost first
  useEffect(() => {
    const currentUserId = currentUser?.id || null;

    // If user changed (not just initial load)
    if (previousUserId.current !== null && previousUserId.current !== currentUserId) {
      // Force Mattermost logout by loading logout URL
      setIsLoggingOut(true);
      setIframeUrl(MATTERMOST_LOGOUT_URL);

      // After logout completes, reload main Mattermost URL
      const timer = setTimeout(() => {
        setIframeUrl(MATTERMOST_URL + '?t=' + Date.now()); // Cache bust
        setIsLoggingOut(false);
      }, 1500);

      return () => clearTimeout(timer);
    }

    previousUserId.current = currentUserId;
  }, [currentUser?.id]);

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <p className="text-gray-500">Please log in to access Mattermost</p>
      </div>
    );
  }

  if (isLoggingOut) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Switching account...</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={currentUser.id}
      src={iframeUrl}
      className="w-full h-full border-0"
      title="Mattermost Chat"
      allow="camera; microphone; display-capture; fullscreen"
    />
  );
};

export default MattermostPanel;
