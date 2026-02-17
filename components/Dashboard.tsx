
import React from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import { TrendingUp, DollarSign, Users, Target, AlertCircle, CheckCircle2, FileText, ArrowUpRight, Briefcase } from 'lucide-react';
import { FUNNEL_DATA, MOCK_KPIS } from '../constants';
import { useCRM } from '../context/CRMContext';

// Pipeline donut colors matching reference (teal, amber, navy)
const PIPELINE_COLORS = ['#10b981', '#f59e0b', '#1E3A5F', '#e5e7eb'];

// KPI accent bar colors matching reference
const KPI_BAR_COLORS = ['#10b981', '#f59e0b', '#06b6d4', '#94a3b8'];

// Claims status data
const CLAIMS_STATUS = [
  { label: 'In Progress', value: 65, color: '#10b981' },
  { label: 'Under Review', value: 40, color: '#f59e0b' },
  { label: 'Settled', value: 85, color: '#06b6d4' },
];

// Recent claims
const RECENT_CLAIMS = [
  { ref: '#100-06', lender: 'Vanquis', amount: '£12,600', icon: '📄', color: 'bg-emerald-100 dark:bg-emerald-500/20' },
  { ref: '#100-07', lender: 'Aqua', amount: '£2,500', icon: '📋', color: 'bg-amber-100 dark:bg-amber-500/20' },
  { ref: '#164-08', lender: 'Loans 2 Go', amount: '£15,200', icon: '📑', color: 'bg-teal-100 dark:bg-teal-500/20' },
  { ref: '#104-09', lender: '118 Money', amount: '£35,600', icon: '📃', color: 'bg-purple-100 dark:bg-purple-500/20' },
];

const Dashboard: React.FC = () => {
  const { getPipelineStats, contactsPagination } = useCRM();
  const stats = getPipelineStats();

  const kpis = [
    { label: 'Monthly Target', value: `£${(stats.totalValue || 50210).toLocaleString()}`, icon: Target, barColor: KPI_BAR_COLORS[0], barWidth: '75%' },
    { label: 'Pending Claims', value: contactsPagination.total || stats.count || 60, icon: FileText, barColor: KPI_BAR_COLORS[1], barWidth: '60%' },
    { label: 'Active Cases', value: MOCK_KPIS[2]?.value || 45, icon: Briefcase, barColor: KPI_BAR_COLORS[2], barWidth: '85%' },
    { label: 'Conversion', value: MOCK_KPIS[3]?.value || '24%', icon: TrendingUp, barColor: KPI_BAR_COLORS[3], barWidth: '45%' },
  ];

  // Pipeline data for donut
  const pipelineData = [
    { name: 'Settled', value: 50 },
    { name: 'Negotiation', value: 10 },
    { name: 'In Progress', value: 30 },
    { name: 'New Leads', value: 10 },
  ];

  return (
    <div className="p-6 space-y-6 min-h-full transition-colors duration-200">
      {/* KPI Cards with accent bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 animate-fade-in-up">
        {kpis.map((kpi, idx) => (
          <div
            key={idx}
            className={`bg-white dark:bg-surface-800 p-5 rounded-2xl border border-gray-100 dark:border-white/5 card-hover anim-delay-${idx + 1} animate-fade-in-up relative overflow-hidden`}
          >
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ backgroundColor: kpi.barColor, opacity: 0.6 }} />

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: kpi.barColor + '15' }}>
                  <kpi.icon size={16} style={{ color: kpi.barColor }} />
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{kpi.label}</span>
              </div>
              <ArrowUpRight size={14} className="text-gray-300 dark:text-gray-600" />
            </div>

            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{kpi.value}</p>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: kpi.barWidth, backgroundColor: kpi.barColor }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Progress dots connector - visual only */}
      <div className="hidden lg:flex items-center justify-center gap-0 -mt-3 mb-1 animate-fade-in-up anim-delay-2">
        <div className="flex items-center w-full max-w-3xl">
          {KPI_BAR_COLORS.map((color, idx) => (
            <React.Fragment key={idx}>
              <div className="w-3 h-3 rounded-full border-2 shrink-0" style={{ borderColor: color, backgroundColor: idx <= 2 ? color : 'transparent' }} />
              {idx < 3 && <div className="flex-1 h-0.5 bg-gray-200 dark:bg-white/10" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main Content Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Claims Pipeline - Donut */}
        <div className="lg:col-span-4 bg-white dark:bg-surface-800 p-6 rounded-2xl border border-gray-100 dark:border-white/5 animate-fade-in-up anim-delay-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Claims Pipeline</h3>
            <div className="flex items-center gap-1.5">
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"><span className="text-xs">...</span></button>
            </div>
          </div>

          <div className="relative h-56 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pipelineData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  animationBegin={200}
                  animationDuration={800}
                >
                  {pipelineData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIPELINE_COLORS[index]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend with percentages */}
          <div className="grid grid-cols-2 gap-3">
            {pipelineData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIPELINE_COLORS[idx] }} />
                <div>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{item.value}%</span>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">{item.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Claims Status + Recent Claims */}
        <div className="lg:col-span-5 space-y-5">
          {/* Claims Status */}
          <div className="bg-white dark:bg-surface-800 p-5 rounded-2xl border border-gray-100 dark:border-white/5 animate-fade-in-up anim-delay-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Claims Status</h3>
              <div className="flex items-center gap-1.5">
                <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"><span className="text-xs">...</span></button>
              </div>
            </div>

            <div className="flex gap-4 mb-5">
              {CLAIMS_STATUS.map((status, idx) => (
                <div key={idx} className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{status.label}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${status.value}%`, backgroundColor: status.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Monthly Budget / Pipeline Value */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/[0.03] rounded-xl mb-3">
              <div className="flex items-center gap-2">
                <Briefcase size={14} className="text-emerald-500" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Monthly Pipeline</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">£{(stats.totalValue || 200000).toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Monthly Settled</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">£65,900</span>
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                  <ArrowUpRight size={12} className="text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Recent Claims */}
          <div className="bg-white dark:bg-surface-800 p-5 rounded-2xl border border-gray-100 dark:border-white/5 animate-fade-in-up anim-delay-5">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">Recent Claims</h3>
            <div className="space-y-2.5">
              {RECENT_CLAIMS.map((claim, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl ${claim.color} flex items-center justify-center text-sm`}>
                      {claim.icon}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{claim.ref}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{claim.lender}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{claim.amount}</span>
                    <ArrowUpRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-emerald-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Insights Panel */}
        <div className="lg:col-span-3 space-y-5">
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-surface-800 dark:to-surface-800 p-5 rounded-2xl border border-emerald-100 dark:border-white/5 relative overflow-hidden animate-fade-in-up anim-delay-5">
            <div className="absolute top-0 right-0 p-3 opacity-5">
              <TrendingUp size={80} className="text-emerald-600" />
            </div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="bg-emerald-500 text-white p-1.5 rounded-lg">
                <TrendingUp size={12} />
              </div>
              <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-300">AI Insights</h3>
            </div>
            <div className="space-y-2.5 relative z-10">
              <div className="bg-white/80 dark:bg-surface-900 p-3 rounded-xl border border-emerald-50 dark:border-white/5 transition-all hover:shadow-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={14} />
                  <div>
                    <p className="text-xs text-gray-800 dark:text-gray-200 font-semibold">DSAR Delay Alert</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">15 claims awaiting DSAR responses for over 30 days.</p>
                  </div>
                </div>
              </div>
              <div className="bg-white/80 dark:bg-surface-900 p-3 rounded-xl border border-emerald-50 dark:border-white/5 transition-all hover:shadow-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                  <div>
                    <p className="text-xs text-gray-800 dark:text-gray-200 font-semibold">Performance Insight</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">Vanquis response rate dropped 12% this week.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Actions - Compact */}
          <div className="bg-white dark:bg-surface-800 p-5 rounded-2xl border border-gray-100 dark:border-white/5 animate-fade-in-up anim-delay-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Pending Actions</h3>
            <div className="space-y-2">
              {[1,2,3].map((i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-all cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <div>
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200">Review Settlement</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">Ref #1234{i}</p>
                    </div>
                  </div>
                  <button className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">View</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
