
import React, { useEffect, useState } from 'react';
import { 
  Plus, Play, Zap, Clock, 
  ArrowRight, Search, Loader2
} from 'lucide-react';
import WorkflowBuilder from './WorkflowBuilder/WorkflowBuilder';
import { useWorkflowStore } from '../stores/workflowStore';
import { n8nApi } from '../services/n8nApi';

const Workflows: React.FC = () => {
  const [viewMode, setViewMode] = useState<'list' | 'editor'>('list');
  const { fetchWorkflow, createWorkflow } = useWorkflowStore();
  
  // Local list state
  const [workflowList, setWorkflowList] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadWorkflows = async () => {
    setLoadingList(true);
    try {
      const wfs = await n8nApi.getWorkflows();
      setWorkflowList(wfs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'list') {
      loadWorkflows();
    }
  }, [viewMode]);

  const handleEdit = async (id: string) => {
    await fetchWorkflow(id);
    setViewMode('editor');
  };

  const handleNew = async () => {
    const id = await createWorkflow('My New Workflow');
    await fetchWorkflow(id);
    setViewMode('editor');
  };

  const filteredWorkflows = workflowList.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (viewMode === 'editor') {
    return <WorkflowBuilder onBack={() => setViewMode('list')} />;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-6 transition-colors">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
           <h1 className="text-2xl font-bold text-navy-900 dark:text-white flex items-center gap-2">
             <Zap className="text-brand-orange" fill="currentColor" />
             Workflow Automation
           </h1>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
             Connected to <span className="font-bold text-[#FF6D5A]">n8n.fastactionclaims.com</span>
           </p>
        </div>
        <button 
          onClick={handleNew}
          className="bg-[#FF6D5A] hover:bg-[#E05C4B] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
        >
           <Plus size={18} /> New Workflow
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
           <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active Workflows</p>
              <h3 className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                 {workflowList.filter(w => w.active).length}
              </h3>
           </div>
           <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg">
              <Play size={24} fill="currentColor" />
           </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
           <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Executions</p>
              <h3 className="text-2xl font-bold text-navy-900 dark:text-white mt-1">12,402</h3>
           </div>
           <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
              <Zap size={24} fill="currentColor" />
           </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
           <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg. Time Saved</p>
              <h3 className="text-2xl font-bold text-navy-900 dark:text-white mt-1">245 hrs</h3>
           </div>
           <div className="p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg">
              <Clock size={24} />
           </div>
        </div>
      </div>

      {/* Templates List */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm flex-1 overflow-hidden flex flex-col">
         <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-800">
            <h2 className="font-bold text-navy-900 dark:text-white">Your Workflows</h2>
            <div className="relative w-64">
               <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input 
                 type="text" 
                 placeholder="Search workflows..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF6D5A] bg-white dark:bg-slate-700 text-navy-900 dark:text-white placeholder:text-gray-400"
               />
            </div>
         </div>
         
         <div className="overflow-y-auto p-6">
            {loadingList ? (
               <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Loader2 size={32} className="animate-spin mb-4" />
                  <p>Loading workflows from n8n...</p>
               </div>
            ) : filteredWorkflows.length === 0 ? (
               <div className="text-center py-12 text-gray-400">
                  <p>No workflows found.</p>
               </div>
            ) : (
               <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {filteredWorkflows.map(wf => (
                    <div 
                      key={wf.id} 
                      onClick={() => handleEdit(wf.id)}
                      className="border border-gray-200 dark:border-slate-700 rounded-xl p-5 hover:border-[#FF6D5A] dark:hover:border-[#FF6D5A] hover:shadow-md transition-all cursor-pointer group bg-white dark:bg-slate-800 relative overflow-hidden"
                    >
                       <div className="absolute top-0 right-0 p-4">
                          {wf.active ? (
                             <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800">
                                ACTIVE
                             </span>
                          ) : (
                             <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-slate-600">
                                INACTIVE
                             </span>
                          )}
                       </div>

                       <h3 className="font-bold text-lg text-navy-900 dark:text-white mb-1">{wf.name}</h3>
                       <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 h-5 line-clamp-1">ID: {wf.id}</p>
                       
                       <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-slate-700 mt-4">
                          <span className="text-xs text-gray-400 font-medium">Last updated: {new Date(wf.updatedAt).toLocaleDateString()}</span>
                          <span className="text-xs font-bold text-[#FF6D5A] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                             Open Builder <ArrowRight size={12} />
                          </span>
                       </div>
                    </div>
                  ))}
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default Workflows;
