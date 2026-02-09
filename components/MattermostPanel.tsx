import React from 'react';
import { MessageCircle, ExternalLink } from 'lucide-react';

const MATTERMOST_URL = 'https://chat.rowanroseclaims.co.uk';

const MattermostPanel: React.FC = () => {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <MessageCircle size={24} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Mattermost</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Team communication & calls</p>
          </div>
        </div>
        <a
          href={MATTERMOST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-navy-700 text-white rounded-lg hover:bg-navy-600 transition-colors"
        >
          <ExternalLink size={16} />
          <span className="text-sm font-medium">Open in New Tab</span>
        </a>
      </div>

      {/* Mattermost iframe */}
      <div className="flex-1">
        <iframe
          src={MATTERMOST_URL}
          className="w-full h-full border-0"
          title="Mattermost Chat"
          allow="camera; microphone; display-capture; fullscreen"
        />
      </div>
    </div>
  );
};

export default MattermostPanel;
