
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, DollarSign, Users } from 'lucide-react';
import { FUNNEL_DATA, TREND_DATA, MOCK_KPIS } from '../constants';
import { useCRM } from '../context/CRMContext';

const COLORS = ['#1E3A5F', '#415A77', '#778DA9', '#E0E1DD', '#F18F01'];

const Dashboard: React.FC = () => {
  const { getPipelineStats, contactsPagination } = useCRM();
  const stats = getPipelineStats();

  // Dynamic KPIs based on real context data
  const kpis = [
    { label: 'Total Contacts', value: contactsPagination.total || stats.count, change: 12.5, trend: 'up' },
    { label: 'Pipeline Value', value: `£${stats.totalValue.toLocaleString()}`, change: 15.3, trend: 'up' },
    ...MOCK_KPIS.slice(2) // Keep other mock KPIs for layout purposes
  ];

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-900 min-h-full transition-colors duration-200">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Dashboard Overview</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">Real-time Data</div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-navy-50 dark:bg-slate-700 rounded-lg">
                {idx === 0 ? <Users className="text-navy-700 dark:text-gray-200" size={20} /> :
                 idx === 1 ? <DollarSign className="text-navy-700 dark:text-gray-200" size={20} /> :
                 <TrendingUp className="text-navy-700 dark:text-gray-200" size={20} />}
              </div>
              <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${kpi.trend === 'up' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                {kpi.trend === 'up' ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                {Math.abs(kpi.change as number)}%
              </div>
            </div>
            <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">{kpi.label}</div>
            <div className="text-3xl font-bold text-navy-900 dark:text-white mt-1">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart - Trends */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-navy-800 dark:text-white mb-6">Monthly Claim Trends</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={TREND_DATA}>
                <defs>
                  <linearGradient id="colorClaims" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E3A5F" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#1E3A5F" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" strokeOpacity={0.3}/>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', backgroundColor: '#FFF', color: '#000' }} />
                <Area type="monotone" dataKey="claims" stroke="#1E3A5F" fillOpacity={1} fill="url(#colorClaims)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline Funnel */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-navy-800 dark:text-white mb-2">Pipeline Funnel</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={FUNNEL_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {FUNNEL_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', backgroundColor: '#FFF' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-2 flex-wrap">
             {FUNNEL_DATA.map((entry, index) => (
               <div key={index} className="flex items-center text-xs text-gray-600 dark:text-gray-300">
                 <div className="w-2 h-2 rounded-full mr-1" style={{backgroundColor: COLORS[index]}}></div>
                 {entry.name}
               </div>
             ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* AI Insights Panel */}
        <div className="bg-gradient-to-r from-indigo-50 to-white dark:from-slate-800 dark:to-slate-800 p-6 rounded-xl border border-indigo-100 dark:border-slate-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
             <TrendingUp size={100} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex items-center space-x-2 mb-4">
             <div className="bg-indigo-600 text-white p-1 rounded-md">
                <TrendingUp size={16} />
             </div>
             <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-300">AI Insights</h3>
          </div>
          <div className="space-y-4 relative z-10">
             <div className="flex items-start bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border border-indigo-50 dark:border-slate-700">
                <AlertCircle className="text-orange-500 mr-3 mt-0.5 shrink-0" size={18} />
                <div>
                   <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">DSAR Delay Alert</p>
                   <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">15 claims awaiting DSAR responses for over 30 days. Would you like me to draft follow-up emails?</p>
                </div>
             </div>
             <div className="flex items-start bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border border-indigo-50 dark:border-slate-700">
                <CheckCircle2 className="text-green-500 mr-3 mt-0.5 shrink-0" size={18} />
                <div>
                   <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">Performance Insight</p>
                   <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Vanquis response rate has dropped by 12% this week. Consider prioritizing complaint escalations.</p>
                </div>
             </div>
          </div>
        </div>

        {/* Pending Actions */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-navy-800 dark:text-white mb-4">Pending Actions</h3>
          <ul className="space-y-3">
             {[1,2,3].map((i) => (
                <li key={i} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg border border-gray-100 dark:border-slate-700 cursor-pointer group">
                   <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-brand-orange mr-3"></div>
                      <div>
                         <p className="text-sm font-medium text-navy-900 dark:text-gray-200">Review Settlement Offer</p>
                         <p className="text-xs text-gray-500 dark:text-gray-400">Ref #1234{i} • Amigo Loans</p>
                      </div>
                   </div>
                   <button className="text-xs text-navy-600 dark:text-navy-300 border border-navy-200 dark:border-slate-600 px-3 py-1 rounded hover:bg-navy-50 dark:hover:bg-slate-600">View</button>
                </li>
             ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
