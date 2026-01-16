
import React, { useState } from 'react';
import { PIPELINE_CATEGORIES } from '../constants';
import { ClaimStatus, Claim } from '../types';
import { Clock, PoundSterling, ChevronLeft, Filter, Search, User } from 'lucide-react';
import { useCRM } from '../context/CRMContext';

const Pipeline: React.FC = () => {
  const { claims, contacts, updateClaimStatus } = useCRM();
  // Drag state tracks claim ID now, not contact ID
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

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      {/* Pipeline Toolbar */}
      <div className="h-16 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between px-6 flex-shrink-0">
         <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-navy-900 dark:text-white">Claims Pipeline</h2>
            <span className="bg-navy-50 dark:bg-slate-700 text-navy-700 dark:text-gray-300 text-xs px-2 py-1 rounded-full border border-navy-100 dark:border-slate-600 font-medium">
               {claims.length} Active Claims
            </span>
         </div>

         <div className="flex items-center gap-3">
             <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Filter by Lender..." 
                  value={lenderFilter}
                  onChange={(e) => setLenderFilter(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-white w-48 transition-shadow"
                />
             </div>
             <div className="relative hidden md:block">
                <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Client Name..." 
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-white w-48 transition-shadow"
                />
             </div>
         </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
         <div className="flex space-x-4 h-full min-w-max pb-2">
            {PIPELINE_CATEGORIES.map((cat) => {
               const items = getEnrichedClaimsForCategory(cat.statuses);
               const isDragOver = dragOverColumnId === cat.id;
               const isCollapsed = collapsedColumns.includes(cat.id);
               
               if (isCollapsed) {
                 return (
                   <div 
                      key={cat.id}
                      onClick={() => toggleColumn(cat.id)}
                      className="h-full w-14 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center py-4"
                   >
                      <div className={`w-3 h-3 rounded-full mb-6 ${cat.color.replace('border-l-', 'bg-')}`}></div>
                      <div className="writing-mode-vertical text-gray-600 dark:text-gray-300 font-semibold tracking-wide whitespace-nowrap transform rotate-180 flex-1 flex items-center justify-center">
                        {cat.title}
                      </div>
                      <div className="mt-4 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-xs w-8 h-8 flex items-center justify-center rounded-full font-bold">
                        {items.length}
                      </div>
                   </div>
                 );
               }

               return (
                  <div 
                    key={cat.id} 
                    className={`flex flex-col w-80 h-full transition-all rounded-xl ${isDragOver ? 'bg-slate-200 dark:bg-slate-700 ring-2 ring-brand-orange ring-opacity-50' : ''}`}
                    onDragOver={(e) => handleDragOver(e, cat.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, cat.id, cat.statuses)}
                  >
                     {/* Column Header */}
                     <div className={`flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-t-xl border-t-4 ${cat.color} shadow-sm mb-3 group`}>
                        <div className="flex items-center space-x-2 overflow-hidden">
                           <h3 className="font-bold text-navy-900 dark:text-white truncate" title={cat.title}>{cat.title}</h3>
                           <span className="bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0">{items.length}</span>
                        </div>
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => toggleColumn(cat.id)} className="text-gray-400 hover:text-navy-700 dark:hover:text-white p-1">
                             <ChevronLeft size={16} />
                          </button>
                        </div>
                     </div>
                     
                     {/* Column Body */}
                     <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar pb-10">
                        {items.map((claim) => (
                           <div 
                              key={claim.id} 
                              draggable
                              onDragStart={(e) => handleDragStart(e, claim.id)}
                              className={`
                                bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm 
                                hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative
                                ${draggedClaimId === claim.id ? 'opacity-50 rotate-3 scale-95' : 'opacity-100'}
                              `}
                           >
                              <div className="mb-2">
                                 <h4 className="font-bold text-navy-900 dark:text-white line-clamp-1">{claim.lender} Claim</h4>
                                 <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    <User size={10} className="mr-1"/> 
                                    <span className="truncate">{claim.contactName}</span>
                                 </div>
                              </div>
                              
                              <div className="text-[10px] font-medium mb-3 inline-block px-2 py-0.5 rounded border bg-gray-50 dark:bg-slate-700 border-gray-100 dark:border-slate-600 text-gray-600 dark:text-gray-300 max-w-full truncate">
                                {claim.status}
                              </div>
                              
                              <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-slate-700 mt-1">
                                 <div className="flex items-center text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">
                                    <PoundSterling size={10} className="mr-0.5" />
                                    {(claim.claimValue || 0).toLocaleString()}
                                 </div>
                                 <div className="flex items-center text-xs text-gray-400" title="Days in stage">
                                    <Clock size={12} className="mr-1" />
                                    {claim.daysInStage || 0}d
                                 </div>
                              </div>
                           </div>
                        ))}
                        
                        {items.length === 0 && (
                           <div className="h-24 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-gray-400 text-sm mx-1">
                              Drop here
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
