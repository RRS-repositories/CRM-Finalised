import React from 'react';

const MATTERMOST_URL = 'https://chat.rowanroseclaims.co.uk';

const MattermostPanel: React.FC = () => {
  return (
    <iframe
      src={MATTERMOST_URL}
      className="w-full h-full border-0"
      title="Mattermost Chat"
      allow="camera; microphone; display-capture; fullscreen"
    />
  );
};

export default MattermostPanel;
