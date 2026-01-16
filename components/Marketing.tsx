
import React, { useState } from 'react';
import { 
  Eye, MousePointer2, DollarSign, Target, 
  ChevronDown, Plus, Megaphone, Users, Layout, Send, Download
} from 'lucide-react';

const DATE_RANGES = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: 'last_7d' },
  { label: 'Last 30 Days', value: 'last_30d' },
];

const Marketing: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'leads'>('overview');
  
  // Date Picker State
  const [dateRange, setDateRange] = useState('today');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Mock Data
  const campaigns = [
      { id: '1', name: 'General Awareness', status: 'ACTIVE', objective: 'Brand' },
      { id: '2', name: 'Summer Promo', status: 'PAUSED', objective: 'Leads' }
  ];

  const leads = [
      { id: 'l1', created: '2024-03-20', name: 'Test Lead', email: 'test@example.com', phone: '07000000000' }
  ];

  const selectedLabel = DATE_RANGES.find(r => r.value === dateRange)?.label || 'Today';

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-6 overflow-hidden transition-colors">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 mb-6 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
             <h1 className="text-2xl font-bold text-navy-900 dark:text-white flex items-center gap-2">
                <Layout className="text-blue-600 dark:text-blue-400" /> Marketing Overview
             </h1>
             <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage Campaigns and Leads.</p>
          </div>
          
          {/* Date Picker */}
          <div className="relative">
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors min-w-[140px] justify-between"
            >
              {selectedLabel}
              <ChevronDown size={16} className={`text-gray-500 dark:text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 py-1">
                {DATE_RANGES.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => {
                      setDateRange(range.value);
                      setIsDropdownOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4 border-b border-gray-200 dark:border-slate-700">
           <TabButton id="overview" label="Overview" icon={Layout} active={activeTab} onClick={setActiveTab} />
           <TabButton id="campaigns" label="Campaigns" icon={Megaphone} active={activeTab} onClick={setActiveTab} />
           <TabButton id="leads" label="Leads" icon={Users} active={activeTab} onClick={setActiveTab} />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
           {activeTab === 'overview' && (
              <div className="space-y-6">
                 {/* KPI Cards */}
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <KPICard label="Impressions" value="12,450" icon={Eye} color="blue" />
                    <KPICard label="Clicks" value="850" icon={MousePointer2} color="green" />
                    <KPICard label="Spend" value="£450.00" icon={DollarSign} color="yellow" />
                    <KPICard label="Leads" value="45" icon={Target} color="pink" />
                 </div>

                 {/* Recent Campaigns Table */}
                 <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 font-bold text-navy-900 dark:text-white">Active Campaigns</div>
                    <table className="w-full text-left">
                       <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-600">
                          <tr>
                             <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Name</th>
                             <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Status</th>
                             <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Objective</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                          {campaigns.map(c => (
                             <tr key={c.id} className="dark:text-gray-200">
                                <td className="px-6 py-4 text-sm font-medium text-navy-900 dark:text-white">{c.name}</td>
                                <td className="px-6 py-4"><span className={`text-[10px] font-bold px-2 py-1 rounded ${c.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>{c.status}</span></td>
                                <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">{c.objective}</td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           )}

           {activeTab === 'campaigns' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 {/* Builder Form */}
                 <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm h-fit">
                    <h2 className="font-bold text-lg text-navy-900 dark:text-white mb-4">Create New Campaign</h2>
                    <div className="space-y-4">
                       <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campaign Name</label>
                          <input 
                            type="text" 
                            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            placeholder="e.g. Summer Lead Gen"
                          />
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Objective</label>
                          <select 
                            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                          >
                             <option value="OUTCOME_LEADS">Leads</option>
                             <option value="OUTCOME_TRAFFIC">Traffic</option>
                             <option value="OUTCOME_SALES">Sales</option>
                             <option value="OUTCOME_AWARENESS">Awareness</option>
                          </select>
                       </div>
                       <button 
                         className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors flex justify-center items-center gap-2"
                       >
                          <Plus size={16} /> Launch Campaign
                       </button>
                    </div>
                 </div>

                 {/* Campaign List */}
                 <div className="lg:col-span-2 space-y-4">
                    <h2 className="font-bold text-lg text-navy-900 dark:text-white">Existing Campaigns</h2>
                    {campaigns.map(c => (
                       <div key={c.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start">
                             <div>
                                <h3 className="font-bold text-navy-900 dark:text-white">{c.name}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">ID: {c.id}</p>
                             </div>
                             <span className={`text-[10px] font-bold px-2 py-1 rounded ${c.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>{c.status}</span>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           )}

           {activeTab === 'leads' && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
                 <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 className="font-bold text-navy-900 dark:text-white">Recent Leads</h2>
                    <div className="flex gap-3">
                       <button className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1 hover:text-navy-900 dark:hover:text-white">
                          <Download size={14} /> Export CSV
                       </button>
                    </div>
                 </div>
                 <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-600">
                       <tr>
                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Created</th>
                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Name</th>
                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Email</th>
                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Phone</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                       {leads.map(lead => (
                          <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                             <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">{lead.created}</td>
                             <td className="px-6 py-4 text-sm font-medium text-navy-900 dark:text-white">{lead.name}</td>
                             <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{lead.email}</td>
                             <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{lead.phone}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           )}
      </div>
    </div>
  );
};

// UI Helpers
const TabButton = ({ id, label, icon: Icon, active, onClick }: any) => (
  <button 
    onClick={() => onClick(id)}
    className={`pb-3 px-4 text-sm font-medium flex items-center gap-2 transition-colors border-b-2 ${
       active === id ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'
    }`}
  >
     <Icon size={16} /> {label}
  </button>
);

const KPICard = ({ label, value, icon: Icon, color }: any) => (
  <div className={`bg-${color}-50 dark:bg-${color}-900/20 p-5 rounded-lg border border-${color}-100 dark:border-${color}-900 relative overflow-hidden`}>
     <div className="relative z-10">
        <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">{label}</p>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
     </div>
     <div className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/60 dark:bg-slate-800/60 rounded-full">
        <Icon size={20} className={`text-${color}-600 dark:text-${color}-400`} />
     </div>
  </div>
);

export default Marketing;
