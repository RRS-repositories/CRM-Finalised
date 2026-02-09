import React from 'react';
import { useCRM } from '../context/CRMContext';

const MATTERMOST_URL = 'https://chat.rowanroseclaims.co.uk';

const MattermostPanel: React.FC = () => {
  const { currentUser } = useCRM();

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <p className="text-gray-500">Please log in to access Mattermost</p>
      </div>
    );
  }

  return (
    <iframe
      key={currentUser.id}
      src={MATTERMOST_URL}
      className="w-full h-full border-0"
      title="Mattermost Chat"
      allow="camera; microphone; display-capture; fullscreen"
    />
  );
};

export default MattermostPanel;
