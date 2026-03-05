import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  rowKey?: (row: T) => string;
  compact?: boolean;
}

function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data available',
  defaultSortKey,
  defaultSortDir = 'desc',
  rowKey,
  compact = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey || null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const py = compact ? 'py-2' : 'py-3';
  const px = compact ? 'px-3' : 'px-4';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-600">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${px} ${py} text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                } ${col.sortable !== false ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-100' : ''} ${col.className || ''}`}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable !== false && (
                    sortKey === col.key ? (
                      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    ) : (
                      <ChevronsUpDown size={12} className="opacity-30" />
                    )
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
          {sortedData.length > 0 ? (
            sortedData.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row) : i}
                className={`${onRowClick ? 'cursor-pointer' : ''} hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${px} ${py} text-sm ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    } text-gray-700 dark:text-gray-300`}
                  >
                    {col.render ? col.render(row) : row[col.key] ?? '-'}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
