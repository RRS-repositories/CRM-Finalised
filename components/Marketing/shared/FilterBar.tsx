import React from 'react';
import type { PlatformFilter } from '../../../types/marketing';

interface FilterBarProps {
  platformFilter: PlatformFilter;
  onPlatformChange: (filter: PlatformFilter) => void;
}

const PLATFORM_OPTIONS: { label: string; value: PlatformFilter }[] = [
  { label: 'All Platforms', value: 'all' },
  { label: 'Meta', value: 'meta' },
  { label: 'TikTok', value: 'tiktok' },
];

const FilterBar: React.FC<FilterBarProps> = ({ platformFilter, onPlatformChange }) => {
  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-0.5">
      {PLATFORM_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onPlatformChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            platformFilter === opt.value
              ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default FilterBar;
