
import React, { useState, useMemo } from 'react';
import { PIPELINE_CATEGORIES } from '../constants';
import { ClaimStatus, Claim } from '../types';
import { Clock, PoundSterling, ChevronLeft, Filter, Search, User, Sparkles, AlertCircle, TrendingUp, Phone, Calendar } from 'lucide-react';
import { useCRM } from '../context/CRMContext';

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
    gradient: 'bg-gradient-to-r from-indigo-500 to-indigo-600',
    iconBg: 'bg-indigo-400/30',
    countBg: 'bg-indigo-700/50'
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
  'resolution': {
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

const Pipeline: React.FC = () => {
  const { claims, contacts, updateClaimStatus } = useCRM();
  const [draggedClaimId, setDraggedClaimId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<string[]>([]);

  // Quick Filters State
  const [lenderFilter, setLenderFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  const toggleColumn = (id: string) => {
    setCollapsedColumns(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Helper to enrich claim data with contact name
  const getEnrichedClaimsForCategory = (categoryStatuses: string[]) => {
    return claims.filter(c => {
      const statusMatch = categoryStatuses.includes(c.status);
      const lenderMatch = lenderFilter === '' || c.lender.toLowerCase().includes(lenderFilter.toLowerCase());
      
      let clientMatch = true;
      let contactName = 'Unknown';
      if (clientFilter) {
         const contact = contacts.find(con => con.id === c.contactId);
         contactName = contact ? contact.fullName : 'Unknown';
         clientMatch = contactName.toLowerCase().includes(clientFilter.toLowerCase());
      }

      return statusMatch && lenderMatch && clientMatch;
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

  // Calculate total pipeline value
  const totalPipelineValue = useMemo(() =>
    claims.reduce((sum, claim) => sum + (claim.claimValue || 0), 0),
    [claims]
  );

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-100 via-slate-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-200">
      {/* Compact Pipeline Toolbar */}
      <div className="h-14 border-b border-gray-200/50 dark:border-slate-700/50 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm flex items-center justify-between px-4 flex-shrink-0 shadow-sm">
         <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-navy-900 dark:text-white">Claims Pipeline</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                {claims.length} Claims
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                £{totalPipelineValue.toLocaleString()}
              </span>
            </div>
         </div>

         <div className="flex items-center gap-2">
             <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Lender..."
                  value={lenderFilter}
                  onChange={(e) => setLenderFilter(e.target.value)}
                  className="pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-slate-700 text-gray-800 dark:text-white w-32 transition-all"
                />
             </div>
             <div className="relative hidden md:block">
                <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Client..."
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-slate-700 text-gray-800 dark:text-white w-32 transition-all"
                />
             </div>
         </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
         <div className="flex space-x-3 h-full min-w-max pb-2">
            {PIPELINE_CATEGORIES.map((cat) => {
               const items = getEnrichedClaimsForCategory(cat.statuses);
               const isDragOver = dragOverColumnId === cat.id;
               const isCollapsed = collapsedColumns.includes(cat.id);
               const columnTotal = items.reduce((sum, c) => sum + (c.claimValue || 0), 0);
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
                      <div className={`mt-3 ${gradientConfig.countBg} text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-bold`}>
                        {items.length}
                      </div>
                   </div>
                 );
               }

               return (
                  <div
                    key={cat.id}
                    className={`flex flex-col w-64 h-full transition-all rounded-xl ${isDragOver ? 'ring-2 ring-indigo-400 ring-opacity-70 scale-[1.01]' : ''}`}
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
                              <span className={`${gradientConfig.countBg} text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold`}>
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

                        {/* Column Total Value */}
                        <div className="mt-1.5 text-white relative z-10">
                           <span className="text-lg font-bold">£{columnTotal.toLocaleString()}</span>
                           <span className="text-white/70 text-xs ml-1">Deal value</span>
                        </div>
                     </div>

                     {/* Column Body with subtle background */}
                     <div className="flex-1 overflow-y-auto space-y-2 p-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-b-xl custom-scrollbar pb-6 border border-t-0 border-gray-200/50 dark:border-slate-700/50">
                        {items.map((claim) => {
                           const priority = getPriorityFromClaimValue(claim.claimValue || 0);
                           const priorityStyle = priorityConfig[priority];
                           const aiRecommendation = getAIRecommendation(claim.status, claim.daysInStage || 0);
                           const avatarColor = getAvatarColor(claim.contactName);
                           const initials = claim.contactName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

                           return (
                              <div
                                 key={claim.id}
                                 draggable
                                 onDragStart={(e) => handleDragStart(e, claim.id)}
                                 className={`
                                   bg-white dark:bg-slate-800 rounded-lg shadow-sm hover:shadow-md
                                   transition-all duration-150 cursor-grab active:cursor-grabbing
                                   border-l-[3px] ${priorityStyle.borderColor} border border-gray-100 dark:border-slate-700
                                   ${draggedClaimId === claim.id ? 'opacity-50 rotate-1 scale-98' : 'opacity-100 hover:-translate-y-0.5'}
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
                                             <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                £{(claim.claimValue || 0).toLocaleString()}
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
                           <div className="h-20 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg flex flex-col items-center justify-center text-gray-400 text-xs bg-white/30 dark:bg-slate-800/30">
                              <TrendingUp size={14} className="text-gray-400 mb-1" />
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
