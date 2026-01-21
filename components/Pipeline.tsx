
import React, { useState, useMemo } from 'react';
import { PIPELINE_CATEGORIES, SPEC_LENDERS } from '../constants';
import { ClaimStatus, Claim } from '../types';
import { Clock, ChevronLeft, ChevronDown, Filter, Search, User, Sparkles, AlertCircle, TrendingUp, Phone, Calendar, X } from 'lucide-react';
import { useCRM } from '../context/CRMContext';

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

const Pipeline: React.FC = () => {
  const { claims, contacts, updateClaimStatus } = useCRM();
  const [draggedClaimId, setDraggedClaimId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<string[]>([]);

  // Filter States
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [lenderFilter, setLenderFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  // Dropdown open states
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [lenderDropdownOpen, setLenderDropdownOpen] = useState(false);

  // Search states for dropdowns
  const [statusSearch, setStatusSearch] = useState('');
  const [lenderSearch, setLenderSearch] = useState('');

  // Animation key - changes when filters change to trigger re-animation
  const filterKey = useMemo(() =>
    `${dateRangeFilter}-${statusFilter}-${lenderFilter}-${clientFilter}`,
    [dateRangeFilter, statusFilter, lenderFilter, clientFilter]
  );

  const toggleColumn = (id: string) => {
    setCollapsedColumns(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Helper to enrich claim data with contact name
  const getEnrichedClaimsForCategory = (categoryStatuses: string[]) => {
    return claims.filter(c => {
      // Category status match
      const statusMatch = categoryStatuses.includes(c.status);

      // Specific status filter (if selected)
      const specificStatusMatch = statusFilter === '' || c.status === statusFilter;

      // Lender filter
      const lenderMatch = lenderFilter === '' || c.lender === lenderFilter;

      // Date range filter (using startDate or createdAt if available)
      const dateMatch = isWithinDateRange(c.startDate, dateRangeFilter);

      // Client filter
      let clientMatch = true;
      if (clientFilter) {
         const contact = contacts.find(con => con.id === c.contactId);
         const contactName = contact ? contact.fullName : 'Unknown';
         clientMatch = contactName.toLowerCase().includes(clientFilter.toLowerCase());
      }

      return statusMatch && specificStatusMatch && lenderMatch && dateMatch && clientMatch;
    }).map(claim => {
       // Join with contact data for display
       const contact = contacts.find(con => con.id === claim.contactId);
       return {
          ...claim,
          contactName: contact ? contact.fullName : 'Unknown Client'
       };
    });
  };

  const handleDragStart = (e: React.DragEvent, claimId: string) => {
    setDraggedClaimId(claimId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumnId(columnId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
     // Optional visual cleanup
  };

  const handleDrop = (e: React.DragEvent, categoryId: string, categoryStatuses: ClaimStatus[]) => {
    e.preventDefault();
    setDragOverColumnId(null);

    if (!draggedClaimId) return;

    // Default to the first status in the dropped category
    const newStatus = categoryStatuses[0];
    updateClaimStatus(draggedClaimId, newStatus);
    
    setDraggedClaimId(null);
  };

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

  // Clear all filters
  const clearAllFilters = () => {
    setDateRangeFilter('all');
    setStatusFilter('');
    setLenderFilter('');
    setClientFilter('');
  };

  const hasActiveFilters = dateRangeFilter !== 'all' || statusFilter !== '' || lenderFilter !== '' || clientFilter !== '';

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-100 via-slate-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-200">
      {/* Pipeline Toolbar */}
      <div className="relative z-50 border-b border-gray-200/50 dark:border-slate-700/50 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm px-4 py-2.5 flex-shrink-0 shadow-sm">
         <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <h2 className="text-base font-bold text-navy-900 dark:text-white">Claims Pipeline</h2>
               <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                  {claims.length} Claims
               </span>
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
                     className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-all ${
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
                     className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-all ${
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
                     className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-all ${
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
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        className="pl-7 pr-6 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-white w-36 border border-gray-200 dark:border-slate-600 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all"
                     />
                     {clientFilter && (
                        <X
                           size={12}
                           className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                           onClick={() => setClientFilter('')}
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
      {(dateDropdownOpen || statusDropdownOpen || lenderDropdownOpen) && (
         <div
            className="fixed inset-0 z-40"
            onClick={() => {
               setDateDropdownOpen(false);
               setStatusDropdownOpen(false);
               setLenderDropdownOpen(false);
            }}
         />
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 bg-gradient-to-br from-slate-100 via-gray-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
         <div className="flex space-x-4 h-full min-w-max pb-2">
            {PIPELINE_CATEGORIES.map((cat) => {
               const items = getEnrichedClaimsForCategory(cat.statuses);
               const isDragOver = dragOverColumnId === cat.id;
               const isCollapsed = collapsedColumns.includes(cat.id);
               const gradientConfig = columnGradients[cat.id] || columnGradients['lead-generation'];

               if (isCollapsed) {
                 return (
                   <div
                      key={cat.id}
                      onClick={() => toggleColumn(cat.id)}
                      className={`h-full w-10 ${gradientConfig.gradient} rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer flex flex-col items-center py-3`}
                   >
                      <div className="w-2 h-2 rounded-full mb-4 bg-white/30"></div>
                      <div className="writing-mode-vertical text-white font-medium tracking-wide whitespace-nowrap transform rotate-180 flex-1 flex items-center justify-center text-xs">
                        {cat.title}
                      </div>
                      <div key={`collapsed-${cat.id}-${items.length}-${filterKey}`} className={`mt-3 ${gradientConfig.countBg} text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-bold count-animate`}>
                        {items.length}
                      </div>
                   </div>
                 );
               }

               return (
                  <div
                    key={cat.id}
                    className={`flex flex-col w-64 h-full transition-all rounded-xl shadow-lg hover:shadow-xl bg-white/30 dark:bg-slate-800/30 backdrop-blur-sm ${isDragOver ? 'ring-2 ring-indigo-400 ring-opacity-70 scale-[1.01]' : ''}`}
                    onDragOver={(e) => handleDragOver(e, cat.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, cat.id, cat.statuses)}
                  >
                     {/* Compact Column Header with Gradient */}
                     <div className={`${gradientConfig.gradient} px-3 py-2.5 rounded-t-xl shadow-md mb-0 group relative overflow-hidden`}>
                        {/* Decorative circles */}
                        <div className="absolute -right-3 -top-3 w-14 h-14 rounded-full bg-white/10"></div>

                        <div className="flex items-center justify-between relative z-10">
                           <div className="flex items-center space-x-1.5">
                              <h3 className="font-semibold text-white text-sm truncate" title={cat.title}>{cat.title}</h3>
                              <span key={`${cat.id}-${items.length}-${filterKey}`} className={`${gradientConfig.countBg} text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold count-animate`}>
                                {items.length}
                              </span>
                           </div>
                           <button
                              onClick={() => toggleColumn(cat.id)}
                              className="text-white/70 hover:text-white p-1 rounded hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100"
                           >
                              <ChevronLeft size={14} />
                           </button>
                        </div>

                     </div>

                     {/* Column Body with subtle background */}
                     <div key={filterKey} className="flex-1 overflow-y-auto space-y-3 p-3 bg-gray-50/80 dark:bg-slate-900/60 rounded-b-xl custom-scrollbar pb-6 border border-t-0 border-gray-200 dark:border-slate-700">
                        {items.map((claim, index) => {
                           const priority = getPriorityFromClaimValue(claim.claimValue || 0);
                           const priorityStyle = priorityConfig[priority];
                           const aiRecommendation = getAIRecommendation(claim.status, claim.daysInStage || 0);
                           const avatarColor = getAvatarColor(claim.contactName);
                           const initials = claim.contactName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                           const staggerClass = `pipeline-card-stagger-${Math.min(index + 1, 5)}`;

                           return (
                              <div
                                 key={claim.id}
                                 draggable
                                 onDragStart={(e) => handleDragStart(e, claim.id)}
                                 className={`
                                   pipeline-card-enter ${staggerClass}
                                   bg-white dark:bg-slate-800 rounded-lg shadow-md hover:shadow-lg
                                   transition-shadow duration-150 cursor-grab active:cursor-grabbing
                                   border-l-4 ${priorityStyle.borderColor} border border-gray-200 dark:border-slate-600
                                   ${draggedClaimId === claim.id ? 'opacity-50 rotate-1 scale-98' : 'hover:-translate-y-1 hover:scale-[1.02]'}
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
                                                {priorityStyle.label}
                                             </span>
                                          </div>
                                       </div>
                                       {/* Smaller Avatar */}
                                       <div className={`w-7 h-7 rounded-full ${avatarColor} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
                                          {initials}
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
                        })}

                        {items.length === 0 && (
                           <div className="h-24 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl flex flex-col items-center justify-center text-gray-400 text-xs bg-white/60 dark:bg-slate-800/40 shadow-inner">
                              <TrendingUp size={16} className="text-gray-400 mb-1.5" />
                              Drop claims here
                           </div>
                        )}
                     </div>
                  </div>
               );
            })}
         </div>
      </div>
    </div>
  );
};

export default Pipeline;
