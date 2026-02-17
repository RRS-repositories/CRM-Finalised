
import React, { useState, useMemo, useEffect, useCallback, memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PIPELINE_CATEGORIES, SPEC_LENDERS } from '../constants';
import { ClaimStatus, Claim, Contact } from '../types';
import { Clock, ChevronLeft, ChevronDown, Filter, Search, User, Sparkles, AlertCircle, TrendingUp, Phone, Calendar, X, LayoutGrid, List, CheckSquare, Square } from 'lucide-react';
import { useCRM } from '../context/CRMContext';

// === PERFORMANCE: Debounce hook to prevent re-render on every keystroke ===
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// View type for toggle
type ViewType = 'kanban' | 'list';

// Date range options
const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
];

// Get all status values from ClaimStatus enum
const ALL_STATUSES = Object.values(ClaimStatus);

// Priority levels for visual distinction
type Priority = 'critical' | 'high' | 'medium' | 'low';

const getPriorityFromClaimValue = (value: number): Priority => {
  if (value >= 50000) return 'critical';
  if (value >= 20000) return 'high';
  if (value >= 5000) return 'medium';
  return 'low';
};

const priorityConfig: Record<Priority, { label: string; color: string; bgColor: string; borderColor: string }> = {
  critical: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-l-red-500' },
  high: { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-100', borderColor: 'border-l-orange-500' },
  medium: { label: 'Medium', color: 'text-amber-700', bgColor: 'bg-amber-100', borderColor: 'border-l-amber-500' },
  low: { label: 'Low', color: 'text-green-700', bgColor: 'bg-green-100', borderColor: 'border-l-green-500' },
};

// Enhanced column configurations with gradients
const columnGradients: Record<string, { gradient: string; iconBg: string; countBg: string }> = {
  'lead-generation': {
    gradient: 'bg-gradient-to-r from-blue-500 to-blue-600',
    iconBg: 'bg-blue-400/30',
    countBg: 'bg-blue-700/50'
  },
  'onboarding': {
    gradient: 'bg-gradient-to-r from-violet-500 to-purple-600',
    iconBg: 'bg-violet-400/30',
    countBg: 'bg-violet-700/50'
  },
  'dsar-process': {
    gradient: 'bg-gradient-to-r from-amber-400 to-orange-500',
    iconBg: 'bg-amber-400/30',
    countBg: 'bg-amber-700/50'
  },
  'complaint': {
    gradient: 'bg-gradient-to-r from-rose-500 to-pink-600',
    iconBg: 'bg-rose-400/30',
    countBg: 'bg-rose-700/50'
  },
  'fos-escalation': {
    gradient: 'bg-gradient-to-r from-red-500 to-red-600',
    iconBg: 'bg-red-400/30',
    countBg: 'bg-red-700/50'
  },
  'payments': {
    gradient: 'bg-gradient-to-r from-emerald-500 to-green-600',
    iconBg: 'bg-emerald-400/30',
    countBg: 'bg-emerald-700/50'
  },
  'debt-recovery': {
    gradient: 'bg-gradient-to-r from-cyan-500 to-teal-600',
    iconBg: 'bg-cyan-400/30',
    countBg: 'bg-cyan-700/50'
  },
};

// AI recommendation suggestions based on status
const getAIRecommendation = (status: string, daysInStage: number): string | null => {
  if (daysInStage > 14 && status.includes('LEAD')) return 'Schedule a discovery call';
  if (status.includes('DSAR') && daysInStage > 21) return 'Send follow-up to lender';
  if (status.includes('COMPLAINT') && daysInStage > 7) return 'Schedule presentation with CFO';
  if (status.includes('OFFER') && daysInStage > 3) return 'Outline key terms and get approvals from stakeholders.';
  if (status.includes('ONBOARDING') && daysInStage > 5) return 'Complete document verification';
  if (daysInStage > 30) return 'Review case progress urgently';
  return null;
};

// Generate avatar color based on name
const getAvatarColor = (name: string): string => {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
    'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500'
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
};

// Generate Client ID (RR-YYMMDD-XXXX format) - same logic as Contacts.tsx
const generateClientId = (contact: { id: string; clientId?: string; createdAt?: string }): string => {
  if (contact.clientId) return contact.clientId;
  const dateStr = contact.createdAt || new Date().toISOString();
  const datePart = new Date(dateStr).toISOString().slice(2, 10).replace(/-/g, '').slice(0, 6);
  const idPart = contact.id.slice(-4).toUpperCase();
  return `RR-${datePart}-${idPart}`;
};

// Date filter helper function
const isWithinDateRange = (dateStr: string | undefined, range: string): boolean => {
  if (!dateStr || range === 'all') return true;

  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case 'today':
      return date >= today;
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return date >= yesterday && date < today;
    }
    case 'this_week': {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      return date >= startOfWeek;
    }
    case 'last_week': {
      const startOfLastWeek = new Date(today);
      startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(endOfLastWeek.getDate() + 7);
      return date >= startOfLastWeek && date < endOfLastWeek;
    }
    case 'last_7_days': {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return date >= sevenDaysAgo;
    }
    case 'last_30_days': {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return date >= thirtyDaysAgo;
    }
    case 'this_month':
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    case 'last_month': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return date >= lastMonth && date < thisMonth;
    }
    case 'last_3_months': {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return date >= threeMonthsAgo;
    }
    case 'last_6_months': {
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      return date >= sixMonthsAgo;
    }
    case 'this_year':
      return date.getFullYear() === now.getFullYear();
    case 'last_year':
      return date.getFullYear() === now.getFullYear() - 1;
    default:
      return true;
  }
};

// Enriched claim type for display
interface EnrichedClaim extends Claim {
  contactName: string;
}

// Enriched claim type for list view
interface ListEnrichedClaim extends EnrichedClaim {
  clientId: string;
  workflowStage: string;
  createdAt: string;
}

// === Memoized Kanban Card Component ===
const KanbanCard = memo<{
  claim: EnrichedClaim;
  index: number;
  isSelected: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, claimId: string) => void;
  onToggleSelection: (claimId: string) => void;
  onNavigateToContact: (contactId: string, claimId: string) => void;
}>(({ claim, index, isSelected, isDragging, onDragStart, onToggleSelection, onNavigateToContact }) => {
  const priority = getPriorityFromClaimValue(claim.claimValue || 0);
  const priorityStyle = priorityConfig[priority];
  const aiRecommendation = getAIRecommendation(claim.status, claim.daysInStage || 0);
  // Only animate first 3 cards per column for performance
  const animateClass = index < 3 ? 'pipeline-card-animate' : '';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, claim.id)}
      onClick={() => onToggleSelection(claim.id)}
      onDoubleClick={() => {
        if (claim.contactId) {
          onNavigateToContact(claim.contactId, claim.id);
        }
      }}
      className={`
        ${animateClass}
        bg-white dark:bg-slate-800 rounded-lg shadow-sm hover:shadow-md
        transition-shadow duration-100 cursor-pointer active:cursor-grabbing
        border-l-4 ${priorityStyle.borderColor} border border-gray-200 dark:border-slate-600
        ${isDragging ? 'opacity-50' : ''}
        ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}
      `}
    >
      {/* Compact Card Header */}
      <div className="p-2.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 dark:text-white text-xs line-clamp-1">{claim.lender}</h4>
            <div className="flex items-center mt-1 flex-wrap gap-1">
              <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded ${priorityStyle.bgColor} ${priorityStyle.color}`}>
                <span className={`w-1 h-1 rounded-full mr-1 ${priorityStyle.color.replace('text-', 'bg-')}`}></span>
                {claim.status}
              </span>
            </div>
          </div>
          {/* Checkbox for selection */}
          <div className="flex-shrink-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelection(claim.id);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-5 h-5 rounded border-gray-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Compact AI Recommendation */}
      {aiRecommendation && (
        <div className="mx-2.5 mb-2 p-2 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded border border-indigo-100 dark:border-indigo-800/30">
          <div className="flex items-center gap-1 mb-0.5">
            <Sparkles size={10} className="text-indigo-500" />
            <span className="text-[8px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase">AI recommendation</span>
          </div>
          <p className="text-[10px] text-gray-700 dark:text-gray-300 leading-tight">{aiRecommendation}</p>
        </div>
      )}

      {/* Compact Card Footer */}
      <div className="px-2.5 py-1.5 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 rounded-b-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center text-[10px] text-gray-500 dark:text-gray-400">
            <User size={10} className="mr-1" />
            <span className="truncate max-w-[90px]">{claim.contactName}</span>
          </div>
          <div className="flex items-center text-[10px] text-gray-400" title="Days in stage">
            <Clock size={10} className="mr-0.5" />
            <span className={(claim.daysInStage || 0) > 14 ? 'text-amber-500 font-medium' : ''}>
              {claim.daysInStage || 0}d
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
KanbanCard.displayName = 'KanbanCard';

// === Memoized Kanban Column Component ===
const KanbanColumn = memo<{
  cat: typeof PIPELINE_CATEGORIES[number];
  items: EnrichedClaim[];
  filterKey: string;
  isDragOver: boolean;
  isCollapsed: boolean;
  selectedClaims: Set<string>;
  draggedClaimId: string | null;
  onToggleColumn: (id: string) => void;
  onDragOver: (e: React.DragEvent, columnId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, categoryId: string, categoryStatuses: ClaimStatus[]) => void;
  onDragStart: (e: React.DragEvent, claimId: string) => void;
  onToggleSelection: (claimId: string) => void;
  onNavigateToContact: (contactId: string, claimId: string) => void;
}>(({ cat, items, filterKey, isDragOver, isCollapsed, selectedClaims, draggedClaimId, onToggleColumn, onDragOver, onDragLeave, onDrop, onDragStart, onToggleSelection, onNavigateToContact }) => {
  const gradientConfig = columnGradients[cat.id] || columnGradients['lead-generation'];
  // === PERFORMANCE: Progressive rendering - only render limited cards initially ===
  const INITIAL_RENDER_LIMIT = 20;
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);

  // Reset render limit when items change (e.g. filter applied)
  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_LIMIT);
  }, [items.length, filterKey]);

  const visibleItems = items.slice(0, renderLimit);
  const hiddenCount = items.length - renderLimit;

  if (isCollapsed) {
    return (
      <div
        onClick={() => onToggleColumn(cat.id)}
        className={`h-full w-10 ${gradientConfig.gradient} rounded-xl shadow-sm cursor-pointer flex flex-col items-center py-3`}
      >
        <div className="w-2 h-2 rounded-full mb-4 bg-white/30"></div>
        <div className="writing-mode-vertical text-white font-medium tracking-wide whitespace-nowrap transform rotate-180 flex-1 flex items-center justify-center text-xs">
          {cat.title}
        </div>
        <div className={`mt-3 ${gradientConfig.countBg} text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-bold`}>
          {items.length}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col w-64 h-full rounded-xl shadow-sm bg-white/90 dark:bg-slate-800/90 ${isDragOver ? 'ring-2 ring-indigo-400 ring-opacity-70' : ''}`}
      onDragOver={(e) => onDragOver(e, cat.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, cat.id, cat.statuses)}
    >
      {/* Compact Column Header with Gradient */}
      <div className={`${gradientConfig.gradient} px-3 py-2.5 rounded-t-xl shadow-sm mb-0 group relative overflow-hidden`}>
        {/* Decorative circles */}
        <div className="absolute -right-3 -top-3 w-14 h-14 rounded-full bg-white/10"></div>

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center space-x-1.5">
            <h3 className="font-semibold text-white text-sm truncate" title={cat.title}>{cat.title}</h3>
            <span className={`${gradientConfig.countBg} text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold`}>
              {items.length}
            </span>
          </div>
          <button
            onClick={() => onToggleColumn(cat.id)}
            className="text-white/70 hover:text-white p-1 rounded hover:bg-white/20 transition-opacity duration-100 opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Column Body */}
      <div className="flex-1 overflow-y-auto space-y-2 p-2.5 bg-gray-50 dark:bg-slate-900/60 rounded-b-xl custom-scrollbar pb-4 border border-t-0 border-gray-200 dark:border-slate-700">
        {visibleItems.map((claim, index) => (
          <KanbanCard
            key={claim.id}
            claim={claim}
            index={index}
            isSelected={selectedClaims.has(claim.id)}
            isDragging={draggedClaimId === claim.id || (selectedClaims.has(claim.id) && draggedClaimId !== null)}
            onDragStart={onDragStart}
            onToggleSelection={onToggleSelection}
            onNavigateToContact={onNavigateToContact}
          />
        ))}

        {/* Load more button for columns with many cards */}
        {hiddenCount > 0 && (
          <button
            onClick={() => setRenderLimit(prev => prev + 20)}
            className="w-full py-2 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 font-medium"
          >
            Show {Math.min(hiddenCount, 20)} more ({hiddenCount} remaining)
          </button>
        )}

        {items.length === 0 && (
          <div className="h-24 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs bg-white/60 dark:bg-slate-800/40">
            <TrendingUp size={16} className="text-gray-400 mb-1.5" />
            Drop claims here
          </div>
        )}
      </div>
    </div>
  );
});
KanbanColumn.displayName = 'KanbanColumn';

const Pipeline: React.FC = () => {
  const { claims, contacts, updateClaimStatus, bulkUpdateClaimStatusByIds, navigateToContact, fetchAllClaims } = useCRM();
  const navigate = useNavigate();

  // Fetch all claims when Pipeline loads
  useEffect(() => {
    fetchAllClaims();
  }, []);
  const [draggedClaimId, setDraggedClaimId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<string[]>([]);

  // View toggle state
  const [viewType, setViewType] = useState<ViewType>('kanban');

  // Selection state for list view
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Inline status dropdown state for list view rows
  const [inlineStatusDropdownId, setInlineStatusDropdownId] = useState<string | null>(null);

  // Filter States
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [lenderFilter, setLenderFilter] = useState('');
  const [clientFilterInput, setClientFilterInput] = useState('');
  // Debounce client search - wait 300ms after typing stops before filtering
  const clientFilter = useDebouncedValue(clientFilterInput, 300);

  // Dropdown open states
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [lenderDropdownOpen, setLenderDropdownOpen] = useState(false);

  // Search states for dropdowns
  const [statusSearch, setStatusSearch] = useState('');
  const [lenderSearch, setLenderSearch] = useState('');

  // Pagination state for list view
  const [claimsPerPage, setClaimsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // Animation key - changes when filters change to trigger re-animation
  const filterKey = useMemo(() =>
    `${dateRangeFilter}-${statusFilter}-${lenderFilter}-${clientFilter}`,
    [dateRangeFilter, statusFilter, lenderFilter, clientFilter]
  );

  const toggleColumn = useCallback((id: string) => {
    setCollapsedColumns(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }, []);

  // === PERFORMANCE: O(1) contact lookup map instead of O(n) .find() per claim ===
  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const contact of contacts) {
      map.set(contact.id, contact);
    }
    return map;
  }, [contacts]);

  // === PERFORMANCE: Status-to-category lookup map for O(1) workflow stage resolution ===
  const statusToCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of PIPELINE_CATEGORIES) {
      for (const status of category.statuses) {
        map.set(status, category.title);
      }
    }
    return map;
  }, []);

  // === PERFORMANCE: Single pass filter + enrich for all claims ===
  // Pre-filter claims once, then bucket by category - instead of filtering 7 times
  const { enrichedClaimsByCategory, allFilteredClaims } = useMemo(() => {
    const clientFilterLower = clientFilter ? clientFilter.toLowerCase() : '';

    // Initialize buckets for each category
    const buckets: Record<string, EnrichedClaim[]> = {};
    for (const cat of PIPELINE_CATEGORIES) {
      buckets[cat.id] = [];
    }

    // Build status-to-categoryId map
    const statusToCatId = new Map<string, string>();
    for (const cat of PIPELINE_CATEGORIES) {
      for (const status of cat.statuses) {
        statusToCatId.set(status, cat.id);
      }
    }

    const allFiltered: ListEnrichedClaim[] = [];

    for (const claim of claims) {
      const contact = contactMap.get(claim.contactId);
      const contactName = contact ? contact.fullName : 'Unknown Client';

      // Apply common filters
      const specificStatusMatch = statusFilter === '' || claim.status === statusFilter;
      if (!specificStatusMatch) continue;

      const lenderMatch = lenderFilter === '' || claim.lender === lenderFilter;
      if (!lenderMatch) continue;

      const dateMatch = isWithinDateRange(claim.startDate, dateRangeFilter);
      if (!dateMatch) continue;

      if (clientFilterLower) {
        const nameMatch = contactName.toLowerCase().includes(clientFilterLower);
        if (!nameMatch) continue;
      }

      // Enrich claim with contact name
      const enriched: EnrichedClaim = { ...claim, contactName };

      // Add to category bucket for kanban view
      const catId = statusToCatId.get(claim.status);
      if (catId && buckets[catId]) {
        buckets[catId].push(enriched);
      }

      // Add to flat list for list view
      allFiltered.push({
        ...enriched,
        clientId: contact ? generateClientId({ id: contact.id, clientId: contact.clientId, createdAt: contact.createdAt }) : 'N/A',
        workflowStage: statusToCategoryMap.get(claim.status) || 'Unknown',
        createdAt: claim.startDate || contact?.createdAt || ''
      });
    }

    // Sort list view by date (newest first)
    allFiltered.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return { enrichedClaimsByCategory: buckets, allFilteredClaims: allFiltered };
  }, [claims, contactMap, statusFilter, lenderFilter, dateRangeFilter, clientFilter, statusToCategoryMap]);

  // Pagination calculations for list view
  const totalPages = Math.ceil(allFilteredClaims.length / claimsPerPage);
  const startIndex = (currentPage - 1) * claimsPerPage;
  const endIndex = startIndex + claimsPerPage;
  const paginatedClaims = useMemo(() =>
    allFilteredClaims.slice(startIndex, endIndex),
    [allFilteredClaims, startIndex, endIndex]
  );

  // Reset to page 1 when filters change or per-page changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, lenderFilter, dateRangeFilter, clientFilter, claimsPerPage]);

  // Selection handlers for list view - wrapped in useCallback for stable references
  const toggleClaimSelection = useCallback((claimId: string) => {
    setSelectedClaims(prev => {
      const newSet = new Set(prev);
      if (newSet.has(claimId)) {
        newSet.delete(claimId);
      } else {
        newSet.add(claimId);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedClaims(prev => {
      if (prev.size === allFilteredClaims.length) {
        return new Set<string>();
      } else {
        return new Set(allFilteredClaims.map(c => c.id));
      }
    });
  }, [allFilteredClaims]);

  const clearSelection = useCallback(() => {
    setSelectedClaims(new Set());
  }, []);

  // Bulk update status for selected claims - optimized single API call
  const handleBulkStatusUpdate = async (newStatus: ClaimStatus) => {
    const claimIds = Array.from(selectedClaims);
    await bulkUpdateClaimStatusByIds(claimIds, newStatus);
    setSelectedClaims(new Set());
    setShowStatusDropdown(false);
  };

  const handleDragStart = useCallback((e: React.DragEvent, claimId: string) => {
    setSelectedClaims(prev => {
      if (prev.has(claimId)) {
        setDraggedClaimId(claimId);
        return prev;
      } else {
        setDraggedClaimId(claimId);
        return new Set([claimId]);
      }
    });
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumnId(columnId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
     // Optional visual cleanup
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, categoryId: string, categoryStatuses: ClaimStatus[]) => {
    e.preventDefault();
    setDragOverColumnId(null);

    if (!draggedClaimId) return;

    const newStatus = categoryStatuses[0];

    if (selectedClaims.size > 1) {
      const claimIds = Array.from(selectedClaims);
      await bulkUpdateClaimStatusByIds(claimIds, newStatus);
      setSelectedClaims(new Set());
    } else {
      await updateClaimStatus(draggedClaimId, newStatus);
      setSelectedClaims(new Set());
    }

    setDraggedClaimId(null);
  }, [draggedClaimId, selectedClaims, bulkUpdateClaimStatusByIds, updateClaimStatus]);

  // Get unique lenders from claims
  const uniqueLenders = useMemo(() => {
    const lendersFromClaims = [...new Set(claims.map(c => c.lender).filter(Boolean))];
    // Combine with SPEC_LENDERS and remove duplicates
    const allLenders = [...new Set([...SPEC_LENDERS.filter(l => l !== 'Other (specify)'), ...lendersFromClaims])];
    return allLenders.sort();
  }, [claims]);

  // Filtered statuses for dropdown
  const filteredStatuses = useMemo(() => {
    if (!statusSearch) return ALL_STATUSES;
    return ALL_STATUSES.filter(s => s.toLowerCase().includes(statusSearch.toLowerCase()));
  }, [statusSearch]);

  // Filtered lenders for dropdown
  const filteredLenders = useMemo(() => {
    if (!lenderSearch) return uniqueLenders;
    return uniqueLenders.filter(l => l.toLowerCase().includes(lenderSearch.toLowerCase()));
  }, [lenderSearch, uniqueLenders]);

  // Stable callback for navigating to a contact from kanban card
  const handleNavigateToContact = useCallback((contactId: string, claimId: string) => {
    navigateToContact(contactId, 'claims', claimId);
    navigate('/contacts');
  }, [navigateToContact, navigate]);

  // Clear all filters
  const clearAllFilters = () => {
    setDateRangeFilter('all');
    setStatusFilter('');
    setLenderFilter('');
    setClientFilterInput('');
  };

  const hasActiveFilters = dateRangeFilter !== 'all' || statusFilter !== '' || lenderFilter !== '' || clientFilterInput !== '';

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-900">
      {/* Pipeline Toolbar */}
      <div className="relative z-50 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 flex-shrink-0 shadow-sm">
         <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <h2 className="text-base font-bold text-navy-900 dark:text-white">Claims Pipeline</h2>
               <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                  {claims.length} Claims
               </span>
               {/* View Toggle Button */}
               <div className="flex items-center bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
                  <button
                     onClick={() => setViewType('kanban')}
                     className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                        viewType === 'kanban'
                           ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                           : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                     }`}
                     title="Kanban View"
                  >
                     <LayoutGrid size={14} />
                     <span className="hidden sm:inline">Kanban</span>
                  </button>
                  <button
                     onClick={() => setViewType('list')}
                     className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                        viewType === 'list'
                           ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                           : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                     }`}
                     title="List View"
                  >
                     <List size={14} />
                     <span className="hidden sm:inline">List</span>
                  </button>
               </div>
            </div>

            {/* Compact Filter Bar */}
            <div className="flex items-center gap-2">
               {/* Date Range Filter */}
               <div className="relative">
                  <button
                     onClick={() => {
                        setDateDropdownOpen(!dateDropdownOpen);
                        setStatusDropdownOpen(false);
                        setLenderDropdownOpen(false);
                     }}
                     className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        dateRangeFilter !== 'all'
                           ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
                           : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-600'
                     }`}
                  >
                     <Calendar size={12} />
                     <span className="max-w-[80px] truncate">{DATE_RANGE_OPTIONS.find(o => o.value === dateRangeFilter)?.label || 'All Time'}</span>
                     {dateRangeFilter !== 'all' ? (
                        <X
                           size={12}
                           className="hover:text-indigo-900 dark:hover:text-indigo-100"
                           onClick={(e) => {
                              e.stopPropagation();
                              setDateRangeFilter('all');
                           }}
                        />
                     ) : (
                        <ChevronDown size={12} className={`transition-transform ${dateDropdownOpen ? 'rotate-180' : ''}`} />
                     )}
                  </button>
                  {dateDropdownOpen && (
                     <div className="absolute right-0 z-[100] mt-1 w-40 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-2xl max-h-64 overflow-y-auto">
                        {DATE_RANGE_OPTIONS.map(option => (
                           <button
                              key={option.value}
                              onClick={() => {
                                 setDateRangeFilter(option.value);
                                 setDateDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${dateRangeFilter === option.value ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'text-gray-700 dark:text-gray-200'}`}
                           >
                              {option.label}
                           </button>
                        ))}
                     </div>
                  )}
               </div>

               {/* Status Filter */}
               <div className="relative">
                  <button
                     onClick={() => {
                        setStatusDropdownOpen(!statusDropdownOpen);
                        setDateDropdownOpen(false);
                        setLenderDropdownOpen(false);
                     }}
                     className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        statusFilter
                           ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                           : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-600'
                     }`}
                  >
                     <AlertCircle size={12} />
                     <span className="max-w-[90px] truncate">{statusFilter || 'Status'}</span>
                     {statusFilter ? (
                        <X
                           size={12}
                           className="hover:text-emerald-900 dark:hover:text-emerald-100"
                           onClick={(e) => {
                              e.stopPropagation();
                              setStatusFilter('');
                           }}
                        />
                     ) : (
                        <ChevronDown size={12} className={`transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                     )}
                  </button>
                  {statusDropdownOpen && (
                     <div className="absolute right-0 z-[100] mt-1 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-2xl">
                        <div className="p-1.5 border-b border-gray-100 dark:border-slate-700">
                           <div className="relative">
                              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                 type="text"
                                 placeholder="Search..."
                                 value={statusSearch}
                                 onChange={(e) => setStatusSearch(e.target.value)}
                                 className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-800 dark:text-white"
                                 onClick={(e) => e.stopPropagation()}
                              />
                           </div>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                           <button
                              onClick={() => {
                                 setStatusFilter('');
                                 setStatusDropdownOpen(false);
                                 setStatusSearch('');
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${statusFilter === '' ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'text-gray-700 dark:text-gray-200'}`}
                           >
                              All Statuses
                           </button>
                           {filteredStatuses.map(status => (
                              <button
                                 key={status}
                                 onClick={() => {
                                    setStatusFilter(status);
                                    setStatusDropdownOpen(false);
                                    setStatusSearch('');
                                 }}
                                 className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${statusFilter === status ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'text-gray-700 dark:text-gray-200'}`}
                              >
                                 {status}
                              </button>
                           ))}
                        </div>
                     </div>
                  )}
               </div>

               {/* Lender Filter */}
               <div className="relative">
                  <button
                     onClick={() => {
                        setLenderDropdownOpen(!lenderDropdownOpen);
                        setDateDropdownOpen(false);
                        setStatusDropdownOpen(false);
                     }}
                     className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        lenderFilter
                           ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                           : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600 hover:bg-gray-200 dark:hover:bg-slate-600'
                     }`}
                  >
                     <TrendingUp size={12} />
                     <span className="max-w-[80px] truncate">{lenderFilter || 'Lender'}</span>
                     {lenderFilter ? (
                        <X
                           size={12}
                           className="hover:text-amber-900 dark:hover:text-amber-100"
                           onClick={(e) => {
                              e.stopPropagation();
                              setLenderFilter('');
                           }}
                        />
                     ) : (
                        <ChevronDown size={12} className={`transition-transform ${lenderDropdownOpen ? 'rotate-180' : ''}`} />
                     )}
                  </button>
                  {lenderDropdownOpen && (
                     <div className="absolute right-0 z-[100] mt-1 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-2xl">
                        <div className="p-1.5 border-b border-gray-100 dark:border-slate-700">
                           <div className="relative">
                              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                 type="text"
                                 placeholder="Search..."
                                 value={lenderSearch}
                                 onChange={(e) => setLenderSearch(e.target.value)}
                                 className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-gray-800 dark:text-white"
                                 onClick={(e) => e.stopPropagation()}
                              />
                           </div>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                           <button
                              onClick={() => {
                                 setLenderFilter('');
                                 setLenderDropdownOpen(false);
                                 setLenderSearch('');
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${lenderFilter === '' ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'text-gray-700 dark:text-gray-200'}`}
                           >
                              All Lenders
                           </button>
                           {filteredLenders.map(lender => (
                              <button
                                 key={lender}
                                 onClick={() => {
                                    setLenderFilter(lender);
                                    setLenderDropdownOpen(false);
                                    setLenderSearch('');
                                 }}
                                 className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors uppercase ${lenderFilter === lender ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'text-gray-700 dark:text-gray-200'}`}
                              >
                                 {lender}
                              </button>
                           ))}
                        </div>
                     </div>
                  )}
               </div>

               {/* Divider */}
               <div className="h-5 w-px bg-gray-300 dark:bg-slate-600"></div>

               {/* Client Search */}
               <div className="relative">
                  <div className="relative">
                     <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                     <input
                        type="text"
                        placeholder="Search client..."
                        value={clientFilterInput}
                        onChange={(e) => setClientFilterInput(e.target.value)}
                        className="pl-7 pr-6 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-white w-36 border border-gray-200 dark:border-slate-600 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                     />
                     {clientFilterInput && (
                        <X
                           size={12}
                           className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                           onClick={() => setClientFilterInput('')}
                        />
                     )}
                  </div>
               </div>

               {/* Clear All Filters */}
               {hasActiveFilters && (
                  <button
                     onClick={clearAllFilters}
                     className="mt-4 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-200 dark:border-red-800"
                  >
                     Clear All
                  </button>
               )}
            </div>
         </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(dateDropdownOpen || statusDropdownOpen || lenderDropdownOpen || inlineStatusDropdownId) && (
         <div
            className="fixed inset-0 z-40"
            onClick={() => {
               setDateDropdownOpen(false);
               setStatusDropdownOpen(false);
               setLenderDropdownOpen(false);
               setInlineStatusDropdownId(null);
            }}
         />
      )}

      {/* List View */}
      {viewType === 'list' && (
         <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-slate-900">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-slate-700">
               {/* Table */}
               <table className="w-full border-collapse">
                  {/* Table Header */}
                  <thead>
                     <tr className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600">
                        <th className="w-12 px-4 py-3 border-r border-gray-200 dark:border-slate-600">
                           <input
                              type="checkbox"
                              checked={allFilteredClaims.length > 0 && selectedClaims.size === allFilteredClaims.length}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                           />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-r border-gray-200 dark:border-slate-600">
                           Client ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-r border-gray-200 dark:border-slate-600">
                           Client Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-r border-gray-200 dark:border-slate-600">
                           Lender
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-r border-gray-200 dark:border-slate-600">
                           Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-r border-gray-200 dark:border-slate-600">
                           Workflow Stage
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                           Created
                        </th>
                     </tr>
                  </thead>
                  {/* Table Body */}
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                     {paginatedClaims.length === 0 ? (
                        <tr>
                           <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                              <TrendingUp size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                              <p className="text-sm">No claims found matching your filters</p>
                           </td>
                        </tr>
                     ) : (
                        paginatedClaims.map((claim, index) => {
                           const priority = getPriorityFromClaimValue(claim.claimValue || 0);
                           const priorityStyle = priorityConfig[priority];
                           const avatarColor = getAvatarColor(claim.contactName);
                           const initials = claim.contactName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                           const stageGradient = columnGradients[PIPELINE_CATEGORIES.find(c => c.title === claim.workflowStage)?.id || 'lead-generation'];
                           const isSelected = selectedClaims.has(claim.id);

                           return (
                              <tr
                                 key={claim.id}
                                 className={`
                                    hover:bg-indigo-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer
                                    ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/50 dark:bg-slate-800/50'}
                                 `}
                                 onClick={() => toggleClaimSelection(claim.id)}
                              >
                                 {/* Checkbox */}
                                 <td className="w-12 px-4 py-3 border-r border-gray-100 dark:border-slate-700">
                                    <input
                                       type="checkbox"
                                       checked={isSelected}
                                       onChange={() => toggleClaimSelection(claim.id)}
                                       onClick={(e) => e.stopPropagation()}
                                       className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                 </td>
                                 {/* Client ID */}
                                 <td className="px-4 py-3 border-r border-gray-100 dark:border-slate-700">
                                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">
                                       {claim.clientId}
                                    </span>
                                 </td>
                                 {/* Client Name */}
                                 <td className="px-4 py-3 border-r border-gray-100 dark:border-slate-700">
                                    <div className="flex items-center gap-2">
                                       <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                          {initials}
                                       </div>
                                       <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                          {claim.contactName}
                                       </span>
                                    </div>
                                 </td>
                                 {/* Lender */}
                                 <td className="px-4 py-3 border-r border-gray-100 dark:border-slate-700">
                                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                       {claim.lender}
                                    </span>
                                 </td>
                                 {/* Status - Clickable Dropdown */}
                                 <td className="px-4 py-3 border-r border-gray-100 dark:border-slate-700 relative">
                                    <button
                                       onClick={(e) => {
                                          e.stopPropagation();
                                          setInlineStatusDropdownId(inlineStatusDropdownId === claim.id ? null : claim.id);
                                       }}
                                       className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-md ${priorityStyle.bgColor} ${priorityStyle.color} hover:ring-2 hover:ring-offset-1 hover:ring-indigo-300 transition-colors cursor-pointer`}
                                    >
                                       <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${priorityStyle.color.replace('text-', 'bg-')}`}></span>
                                       {claim.status}
                                       <ChevronDown size={10} className="ml-1 opacity-60" />
                                    </button>

                                    {/* Inline Status Dropdown */}
                                    {inlineStatusDropdownId === claim.id && (
                                       <div className="absolute left-0 top-full mt-1 z-[100] bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-gray-200 dark:border-slate-600 w-72 max-h-80 overflow-hidden">
                                          <div className="p-2 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50">
                                             <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Change Status</span>
                                          </div>
                                          <div className="overflow-y-auto max-h-64">
                                             {PIPELINE_CATEGORIES.map((category) => {
                                                const catGradient = columnGradients[category.id] || columnGradients['lead-generation'];
                                                return (
                                                   <div key={category.id} className="border-b border-gray-100 dark:border-slate-700 last:border-b-0">
                                                      <div className={`px-3 py-1.5 ${catGradient.gradient}`}>
                                                         <span className="text-[10px] font-semibold text-white uppercase tracking-wider">{category.title}</span>
                                                      </div>
                                                      <div className="py-0.5">
                                                         {category.statuses.map((status) => (
                                                            <button
                                                               key={status}
                                                               onClick={async (e) => {
                                                                  e.stopPropagation();
                                                                  await updateClaimStatus(claim.id, status);
                                                                  setInlineStatusDropdownId(null);
                                                               }}
                                                               className={`w-full text-left px-4 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                                                                  claim.status === status
                                                                     ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                                                                     : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
                                                               }`}
                                                            >
                                                               <span className={`w-1.5 h-1.5 rounded-full ${catGradient.gradient}`}></span>
                                                               {status}
                                                               {claim.status === status && (
                                                                  <span className="ml-auto text-indigo-500">✓</span>
                                                               )}
                                                            </button>
                                                         ))}
                                                      </div>
                                                   </div>
                                                );
                                             })}
                                          </div>
                                       </div>
                                    )}
                                 </td>
                                 {/* Workflow Stage */}
                                 <td className="px-4 py-3 border-r border-gray-100 dark:border-slate-700">
                                    <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-md text-white ${stageGradient.gradient}`}>
                                       {claim.workflowStage}
                                    </span>
                                 </td>
                                 {/* Created Date */}
                                 <td className="px-4 py-3 text-right">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                       {(() => {
                                          if (!claim.createdAt) return '-';
                                          const date = new Date(claim.createdAt);
                                          if (isNaN(date.getTime())) return '-';
                                          return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                                       })()}
                                    </span>
                                 </td>
                              </tr>
                           );
                        })
                     )}
                  </tbody>
               </table>
               {/* Table Footer with Pagination */}
               {allFilteredClaims.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                     <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                           Showing {startIndex + 1}-{Math.min(endIndex, allFilteredClaims.length)} of {allFilteredClaims.length}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <div className="flex items-center gap-1.5">
                           <span className="text-xs text-gray-500 dark:text-gray-400">Show:</span>
                           <select
                              value={claimsPerPage}
                              onChange={(e) => setClaimsPerPage(Number(e.target.value))}
                              className="px-1.5 py-0.5 border border-gray-200 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                           >
                              <option value={20}>20</option>
                              <option value={30}>30</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                           </select>
                        </div>
                     </div>
                     <div className="flex items-center">
                        <button
                           onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                           disabled={currentPage === 1}
                           className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                        >
                           Previous
                        </button>
                        <span className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                           {currentPage} / {totalPages || 1}
                        </span>
                        <button
                           onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                           disabled={currentPage === totalPages || totalPages === 0}
                           className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                        >
                           Next
                        </button>
                     </div>
                  </div>
               )}
            </div>
         </div>
      )}

      {/* Kanban Board */}
      {viewType === 'kanban' && (
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 bg-gradient-to-br from-slate-100 via-gray-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
         <div className="flex space-x-4 h-full min-w-max pb-2">
            {PIPELINE_CATEGORIES.map((cat) => (
               <KanbanColumn
                 key={cat.id}
                 cat={cat}
                 items={enrichedClaimsByCategory[cat.id] || []}
                 filterKey={filterKey}
                 isDragOver={dragOverColumnId === cat.id}
                 isCollapsed={collapsedColumns.includes(cat.id)}
                 selectedClaims={selectedClaims}
                 draggedClaimId={draggedClaimId}
                 onToggleColumn={toggleColumn}
                 onDragOver={handleDragOver}
                 onDragLeave={handleDragLeave}
                 onDrop={handleDrop}
                 onDragStart={handleDragStart}
                 onToggleSelection={toggleClaimSelection}
                 onNavigateToContact={handleNavigateToContact}
               />
            ))}
         </div>
      </div>
      )}

      {/* Selection Action Bar - appears for both List and Kanban views */}
      {selectedClaims.size > 0 && (
         <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
            {/* Status Dropdown */}
            {showStatusDropdown && (
               <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-gray-200 dark:border-slate-600 w-80 max-h-96 overflow-hidden">
                  <div className="p-3 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50">
                     <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Update Status</h3>
                     <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Select a status for {selectedClaims.size} selected claim{selectedClaims.size > 1 ? 's' : ''}</p>
                  </div>
                  <div className="overflow-y-auto max-h-72">
                     {PIPELINE_CATEGORIES.map((category) => {
                        const gradientConfig = columnGradients[category.id] || columnGradients['lead-generation'];
                        return (
                           <div key={category.id} className="border-b border-gray-100 dark:border-slate-700 last:border-b-0">
                              <div className={`px-3 py-2 ${gradientConfig.gradient}`}>
                                 <span className="text-xs font-semibold text-white uppercase tracking-wider">{category.title}</span>
                              </div>
                              <div className="py-1">
                                 {category.statuses.map((status) => (
                                    <button
                                       key={status}
                                       onClick={() => handleBulkStatusUpdate(status)}
                                       className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                                    >
                                       <span className={`w-2 h-2 rounded-full ${gradientConfig.gradient}`}></span>
                                       {status}
                                    </button>
                                 ))}
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </div>
            )}

            {/* Action Bar */}
            <div className="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-4">
               <span className="text-sm font-medium">{selectedClaims.size} selected</span>
               <div className="h-4 w-px bg-slate-600"></div>
               <button
                  className={`text-sm transition-colors flex items-center gap-1.5 ${showStatusDropdown ? 'text-indigo-300' : 'hover:text-indigo-300'}`}
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
               >
                  <TrendingUp size={14} />
                  Update Status
                  <ChevronDown size={14} className={`transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
               </button>
               <div className="h-4 w-px bg-slate-600"></div>
               <button
                  className="text-sm hover:text-red-300 transition-colors"
                  onClick={() => {
                     clearSelection();
                     setShowStatusDropdown(false);
                  }}
               >
                  <X size={16} />
               </button>
            </div>
         </div>
      )}

      {/* Click outside to close status dropdown */}
      {showStatusDropdown && (
         <div
            className="fixed inset-0 z-40"
            onClick={() => setShowStatusDropdown(false)}
         />
      )}
    </div>
  );
};

export default memo(Pipeline);
