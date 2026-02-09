import React, { useEffect, useState } from 'react';
import { useCRM } from '../context/CRMContext';

const MATTERMOST_URL = 'https://chat.rowanroseclaims.co.uk';

const MattermostPanel: React.FC = () => {
  const { currentUser } = useCRM();
  const [iframeKey, setIframeKey] = useState(Date.now());

  // Reload iframe when user changes (login/logout)
  useEffect(() => {
    setIframeKey(Date.now());
  }, [currentUser?.id]);

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <p className="text-gray-500">Please log in to access Mattermost</p>
      </div>
    );
  }

  return (
    <iframe
      key={iframeKey}
      src={MATTERMOST_URL}
      className="w-full h-full border-0"
      title="Mattermost Chat"
      allow="camera; microphone; display-capture; fullscreen"
    />
  );
};

export default MattermostPanel;
