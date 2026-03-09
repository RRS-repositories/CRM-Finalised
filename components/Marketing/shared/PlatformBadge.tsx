import React from 'react';

interface PlatformBadgeProps {
  platform: 'meta' | 'tiktok' | string;
  size?: 'sm' | 'md';
}

const PlatformBadge: React.FC<PlatformBadgeProps> = ({ platform, size = 'sm' }) => {
  const isMeta = platform === 'meta';
  const label = isMeta ? 'Meta' : 'TikTok';
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded ${sizeClasses} ${
        isMeta
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
          : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
      }`}
    >
      {isMeta ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'}>
          <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'}>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .56.04.81.13v-3.5a6.37 6.37 0 0 0-.81-.05A6.34 6.34 0 0 0 3.15 15.4a6.34 6.34 0 0 0 6.34 6.15 6.34 6.34 0 0 0 6.34-6.34V9.13a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.56Z" />
        </svg>
      )}
      {label}
    </span>
  );
};

export default React.memo(PlatformBadge);
