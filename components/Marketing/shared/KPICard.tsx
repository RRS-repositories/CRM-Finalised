import React from 'react';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: number | null;
  deltaLabel?: string;
  prefix?: string;
  color?: 'blue' | 'green' | 'yellow' | 'pink' | 'purple' | 'indigo' | 'orange';
  invertDelta?: boolean; // for costs where lower is better
}

const colorMap = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-100 dark:border-blue-900/40', icon: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-100 dark:bg-blue-900/40' },
  green:  { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-900/40', icon: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  yellow: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-900/40', icon: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/40' },
  pink:   { bg: 'bg-pink-50 dark:bg-pink-900/20', border: 'border-pink-100 dark:border-pink-900/40', icon: 'text-pink-600 dark:text-pink-400', iconBg: 'bg-pink-100 dark:bg-pink-900/40' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-100 dark:border-purple-900/40', icon: 'text-purple-600 dark:text-purple-400', iconBg: 'bg-purple-100 dark:bg-purple-900/40' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-100 dark:border-indigo-900/40', icon: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-100 dark:border-orange-900/40', icon: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-100 dark:bg-orange-900/40' },
};

const KPICard: React.FC<KPICardProps> = ({ label, value, icon: Icon, delta, deltaLabel, color = 'blue', invertDelta = false }) => {
  const c = colorMap[color];
  const isPositive = delta != null && (invertDelta ? delta < 0 : delta > 0);
  const isNegative = delta != null && (invertDelta ? delta > 0 : delta < 0);

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-5 relative overflow-hidden`}>
      <div className="relative z-10">
        <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
        {delta != null && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${
            isPositive ? 'text-emerald-600 dark:text-emerald-400' :
            isNegative ? 'text-red-500 dark:text-red-400' :
            'text-gray-400 dark:text-gray-500'
          }`}>
            {isPositive ? <TrendingUp size={14} /> : isNegative ? <TrendingDown size={14} /> : <Minus size={14} />}
            <span>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
            {deltaLabel && <span className="text-gray-400 dark:text-gray-500 ml-1">{deltaLabel}</span>}
          </div>
        )}
      </div>
      <div className={`absolute right-4 top-1/2 -translate-y-1/2 p-2.5 ${c.iconBg} rounded-full`}>
        <Icon size={20} className={c.icon} />
      </div>
    </div>
  );
};

export default React.memo(KPICard);
