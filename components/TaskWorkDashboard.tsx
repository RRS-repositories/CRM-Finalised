import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileText, DollarSign, Users, Target, RefreshCw, Trophy, ArrowRightLeft, Flag, CheckCircle, Clock, X, UserCheck } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { API_ENDPOINTS } from '../src/config';

interface KPIs {
  dsarSentToLender: number;
  complaintSentToLender: number;
  countersSentToLender: number;
  loggedInUsers: number;
  totalAgents: number;
}

interface LeaderboardEntry {
  name: string;
  actor_id: string;
  tasks_completed: number;
}

interface StatusAction {
  from_status: string;
  to_status: string;
  total: number;
}

interface AgentStatus {
  id: number;
  name: string;
  role: string;
  tasks_allocated: number;
  tasks_completed: number;
  tasks_flagged: number;
  is_online: boolean;
  last_active_at: string | null;
  today_wastage_minutes: number;
  week_wastage_minutes: number;
  month_wastage_minutes: number;
}

interface AgentTask {
  id: number;
  contact_id: number;
  contact_name: string;
  email: string;
  phone: string;
  lender: string;
  status: string;
  claim_value: number | null;
  tw_completed: boolean;
  tw_completed_at: string | null;
  tw_completed_by: number | null;
  tw_red_flag: boolean;
  tw_red_flag_at: string | null;
  tw_red_flag_by: number | null;
  tw_assigned_to: number | null;
  tw_originally_assigned_to: number | null;
  assigned_to_name: string | null;
  flagged_by_name: string | null;
  completed_by_name: string | null;
  originally_assigned_to_name: string | null;
}

type Period = 'day' | 'week' | 'month' | 'year';

const TaskWorkDashboard: React.FC = () => {
  const { currentUser } = useCRM();
  const [period, setPeriod] = useState<Period>('day');
  const [kpis, setKpis] = useState<KPIs>({ dsarSentToLender: 0, complaintSentToLender: 0, countersSentToLender: 0, loggedInUsers: 0, totalAgents: 0 });
  const [dailyLeaderboard, setDailyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [statusActions, setStatusActions] = useState<StatusAction[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [allStatuses, setAllStatuses] = useState<string[]>([]);

  // Agent drill-down modal state
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [agentTasksLoading, setAgentTasksLoading] = useState(false);
  const [agentFlagFilter, setAgentFlagFilter] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());

  if (currentUser?.role !== 'Management') {
    return (
      <div className="flex items-center justify-center h-full text-red-500 font-bold">
        Access Denied. Management privileges required.
      </div>
    );
  }

  // Track whether this is the initial load vs background refresh
  const hasFetchedRef = useRef(false);
  const fetchingRef = useRef(false);

  const fetchAll = useCallback(async (isBackground = false) => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    // Only show loading spinner on initial load, not background refreshes
    if (!isBackground) setLoading(true);
    try {
      const params = `period=${period}`;
      const statusParam = statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : '';
      const [kpiRes, lbRes, saRes, agRes, stRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.api}/task-work/dashboard/kpis?${params}`),
        fetch(`${API_ENDPOINTS.api}/task-work/dashboard/leaderboard?${params}`),
        fetch(`${API_ENDPOINTS.api}/task-work/dashboard/status-actions?${params}${statusParam}`),
        fetch(`${API_ENDPOINTS.api}/task-work/dashboard/agent-status`),
        fetch(`${API_ENDPOINTS.api}/task-work/statuses`),
      ]);
      const [kpiData, lbData, saData, agData, stData] = await Promise.all([
        kpiRes.json(), lbRes.json(), saRes.json(), agRes.json(), stRes.json()
      ]);
      setKpis(kpiData);
      setDailyLeaderboard(lbData.daily || []);
      setWeeklyLeaderboard(lbData.weekly || []);
      setStatusActions(saData.statusActions || []);
      setAgents(agData.agents || []);
      setAllStatuses(stData.statuses || []);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      fetchingRef.current = false;
      if (!isBackground) setLoading(false);
    }
  }, [period, statusFilter]);

  useEffect(() => {
    fetchAll(false);
    // Auto-refresh every 2 minutes (background — no loading spinner)
    const interval = setInterval(() => fetchAll(true), 120000);
    return () => clearInterval(interval);
  }, [fetchAll]);


  const getInitials = useCallback((name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }, []);

  const getAvatarColor = useCallback((name: string) => {
    const colors = [
      'from-blue-500 to-blue-600', 'from-green-500 to-green-600', 'from-purple-500 to-purple-600',
      'from-orange-500 to-orange-600', 'from-pink-500 to-pink-600', 'from-teal-500 to-teal-600',
      'from-indigo-500 to-indigo-600', 'from-cyan-500 to-cyan-600', 'from-rose-500 to-rose-600',
      'from-amber-500 to-amber-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }, []);

  const getRankStyle = useCallback((rank: number) => {
    if (rank === 1) return 'bg-yellow-500 text-black';
    if (rank === 2) return 'bg-blue-500 text-white';
    if (rank === 3) return 'bg-orange-500 text-white';
    return 'bg-gray-600 text-gray-300';
  }, []);

  const onlineCount = useMemo(() => agents.filter(a => a.is_online).length, [agents]);

  const formatWastage = useCallback((minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hrs} HRS ${mins} MINS`;
  }, []);

  const fetchAgentTasks = useCallback(async (agentId: number, flagFilter?: string) => {
    setAgentTasksLoading(true);
    try {
      const params = flagFilter ? `?flagFilter=${flagFilter}` : '';
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/agent-tasks/${agentId}${params}`);
      const data = await res.json();
      setAgentTasks(data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch agent tasks:', err);
    } finally {
      setAgentTasksLoading(false);
    }
  }, []);

  const openAgentModal = useCallback((agent: AgentStatus) => {
    setSelectedAgent(agent);
    setAgentFlagFilter('');
    setSelectedTaskIds(new Set());
    fetchAgentTasks(agent.id);
  }, [fetchAgentTasks]);

  const handleAgentFlagFilterChange = useCallback((filter: string) => {
    setAgentFlagFilter(filter);
    if (selectedAgent) {
      fetchAgentTasks(selectedAgent.id, filter);
      setSelectedTaskIds(new Set());
    }
  }, [selectedAgent, fetchAgentTasks]);

  const handleBulkReassign = useCallback(async () => {
    if (selectedTaskIds.size === 0 || !selectedAgent) return;
    const priyanshu = agents.find(a => a.name === 'Priyanshu Srivastava');
    if (!priyanshu) {
      console.error('Priyanshu Srivastava not found in agents list');
      return;
    }
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds: Array.from(selectedTaskIds), adminId: priyanshu.id }),
      });
      const data = await res.json();
      if (data.success) {
        fetchAgentTasks(selectedAgent.id, agentFlagFilter);
        setSelectedTaskIds(new Set());
        fetchAll(true);
      }
    } catch (err) {
      console.error('Failed to bulk reassign:', err);
    }
  }, [selectedTaskIds, selectedAgent, agents, agentFlagFilter, fetchAgentTasks, fetchAll]);

  const handleTaskSelect = useCallback((taskId: number) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const handleSelectAllTasks = useCallback(() => {
    if (selectedTaskIds.size === agentTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(agentTasks.map(t => t.id)));
    }
  }, [agentTasks, selectedTaskIds]);

  const periodButtons: { value: Period; label: string }[] = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
  ];

  return (
    <div className="h-full overflow-auto bg-gray-100 dark:bg-surface-900 p-6">
      {/* Header with logged-in users count */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{kpis.loggedInUsers} Users Online</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-white/10">
            {periodButtons.map(pb => (
              <button
                key={pb.value}
                onClick={() => setPeriod(pb.value)}
                className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                  period === pb.value
                    ? 'bg-brand-orange text-white'
                    : 'bg-white dark:bg-surface-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                {pb.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchAll()}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 transition-all"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 p-5 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10">
            <FileText size={24} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{kpis.dsarSentToLender}</p>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-0.5">DSAR Sent to Lender</p>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 p-5 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-500/10">
            <DollarSign size={24} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{kpis.complaintSentToLender}</p>
            <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-0.5">Complaint Submitted to Lender</p>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 p-5 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-500/10">
            <Target size={24} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{kpis.countersSentToLender}</p>
            <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-0.5">Counter Response Sent</p>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 p-5 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-500/10">
            <Users size={24} className="text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{onlineCount}<span className="text-lg text-gray-400">/{kpis.totalAgents}</span></p>
            <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mt-0.5">Active Agents</p>
          </div>
        </div>
      </div>

      {/* Middle Row: Leaderboard + Status Changes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Leaderboard - Daily & Weekly */}
        <div className="bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={16} className="text-yellow-500" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Leaderboard</h3>
          </div>

          <div className="grid grid-cols-2 gap-4 max-h-80 overflow-auto">
            {/* Daily */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3 sticky top-0 bg-white dark:bg-surface-800 pb-1 z-10">Today</h4>
              <div className="space-y-2">
                {dailyLeaderboard.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No tasks today</p>
                ) : (
                  dailyLeaderboard.map((entry, idx) => (
                    <div
                      key={entry.actor_id}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all ${
                        idx === 0 ? 'bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${getRankStyle(idx + 1)}`}>
                        {idx + 1}
                      </span>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold bg-gradient-to-br ${getAvatarColor(entry.name)} shrink-0`}>
                        {getInitials(entry.name)}
                      </div>
                      <span className="flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{entry.name}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{entry.tasks_completed}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Weekly/Period */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3 sticky top-0 bg-white dark:bg-surface-800 pb-1 z-10">This {period === 'day' ? 'Week' : period.charAt(0).toUpperCase() + period.slice(1)}</h4>
              <div className="space-y-2">
                {weeklyLeaderboard.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No tasks this period</p>
                ) : (
                  weeklyLeaderboard.map((entry, idx) => (
                    <div
                      key={entry.actor_id}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all ${
                        idx === 0 ? 'bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${getRankStyle(idx + 1)}`}>
                        {idx + 1}
                      </span>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold bg-gradient-to-br ${getAvatarColor(entry.name)} shrink-0`}>
                        {getInitials(entry.name)}
                      </div>
                      <span className="flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{entry.name}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{entry.tasks_completed}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status Changes Table */}
        <div className="bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-gray-400" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Status Changes</h3>
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-surface-900 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-orange/30"
            >
              <option value="">All Statuses</option>
              {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase py-2 px-3">From Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase py-2 px-3">To Status</th>
                  <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase py-2 px-3">Count</th>
                </tr>
              </thead>
              <tbody>
                {statusActions.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-sm text-gray-400 text-center py-8">No status changes for this period</td>
                  </tr>
                ) : (
                  statusActions.map((sa, idx) => (
                    <tr key={idx} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="text-sm text-gray-700 dark:text-gray-300 py-2 px-3">{sa.from_status || 'None'}</td>
                      <td className="text-sm text-gray-700 dark:text-gray-300 py-2 px-3">{sa.to_status}</td>
                      <td className="text-sm font-semibold text-gray-900 dark:text-white py-2 px-3 text-right">{sa.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Agent Status Grid */}
      <div className="bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Agent Status</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{agents.length} Agents</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              Online
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              Offline
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {agents.map(agent => (
            <div key={agent.id} onClick={() => openAgentModal(agent)} className="flex flex-col items-center p-4 rounded-xl bg-gray-50 dark:bg-surface-900 border border-gray-200 dark:border-white/10 hover:border-brand-orange/30 transition-all cursor-pointer">
              {/* Avatar with online indicator */}
              <div className="relative mb-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br ${getAvatarColor(agent.name)}`}>
                  {getInitials(agent.name)}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-gray-50 dark:border-surface-900 ${
                  agent.is_online ? 'bg-green-500' : 'bg-red-500'
                }`} />
              </div>
              <span className="text-xs font-medium text-gray-800 dark:text-gray-200 text-center truncate w-full">{agent.name.split(' ')[0]}</span>
              <span className="text-[10px] text-gray-400 mb-2">{agent.role}</span>

              {/* Stats */}
              <div className="w-full space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500 dark:text-gray-400">Allocated</span>
                  <span className="font-bold text-gray-900 dark:text-white">{agent.tasks_allocated}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle size={10} />
                    Completed
                  </span>
                  <span className="font-bold text-green-600 dark:text-green-400">{agent.tasks_completed}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
                    <Flag size={10} />
                    Flagged
                  </span>
                  <span className="font-bold text-red-500 dark:text-red-400">{agent.tasks_flagged}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-200 dark:border-white/10">
                  <span className="text-gray-500 dark:text-gray-400">Remaining</span>
                  <span className="font-bold text-gray-900 dark:text-white">{Math.max(0, agent.tasks_allocated - agent.tasks_completed)}</span>
                </div>
                {/* Time Wastage */}
                <div className="pt-1.5 mt-1.5 border-t border-gray-200 dark:border-white/10">
                  <div className="flex items-center gap-1 mb-1">
                    <Clock size={9} className="text-gray-400" />
                    <span className="text-[9px] font-semibold uppercase text-gray-400 tracking-wider">Time Wastage</span>
                  </div>
                  <div className="text-[10px] font-bold text-gray-700 dark:text-gray-300">
                    {formatWastage(Number(agent.today_wastage_minutes) || 0)}
                  </div>
                  <div className="flex items-center justify-between text-[9px] mt-0.5">
                    <span className="text-gray-400">This Week</span>
                    <span className={`font-bold ${Number(agent.week_wastage_minutes) > 300 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {formatWastage(Number(agent.week_wastage_minutes) || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] mt-0.5">
                    <span className="text-gray-400">This Month</span>
                    <span className={`font-bold ${Number(agent.month_wastage_minutes) > 600 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {formatWastage(Number(agent.month_wastage_minutes) || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Tasks Drill-Down Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedAgent(null)}>
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 w-[90vw] max-w-5xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br ${getAvatarColor(selectedAgent.name)}`}>
                  {getInitials(selectedAgent.name)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedAgent.name}</h2>
                  <p className="text-xs text-gray-400">{selectedAgent.role} &middot; {agentTasks.length} tasks</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Bulk Reassign Button */}
                {selectedTaskIds.size > 0 && (
                  <button
                    onClick={handleBulkReassign}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all"
                  >
                    <UserCheck size={14} />
                    Reassign {selectedTaskIds.size} to Priyanshu
                  </button>
                )}
                <button onClick={() => setSelectedAgent(null)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 dark:border-white/10 shrink-0">
              {(['', 'completed', 'red_flagged'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => handleAgentFlagFilterChange(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    agentFlagFilter === f
                      ? f === 'completed' ? 'bg-green-500/10 text-green-500 border border-green-500/30'
                        : f === 'red_flagged' ? 'bg-red-500/10 text-red-500 border border-red-500/30'
                        : 'bg-brand-orange/10 text-brand-orange border border-brand-orange/30'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {f === '' ? 'All' : f === 'completed' ? 'Task Completed' : 'Red Flagged'}
                </button>
              ))}
            </div>

            {/* Tasks Table */}
            <div className="flex-1 overflow-auto">
              {agentTasksLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-3 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" />
                </div>
              ) : agentTasks.length === 0 ? (
                <div className="text-center py-20 text-gray-400 text-sm">No tasks found</div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-surface-900 z-10">
                    <tr className="border-b border-gray-200 dark:border-white/5">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={agentTasks.length > 0 && selectedTaskIds.size === agentTasks.length}
                          onChange={handleSelectAllTasks}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-orange focus:ring-brand-orange/50 cursor-pointer"
                        />
                      </th>
                      <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Contact</th>
                      <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Lender</th>
                      <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Status</th>
                      <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Assigned To</th>
                      <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 min-w-[200px]">Flag Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentTasks.map(task => (
                      <tr key={task.id} className={`border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-all ${selectedTaskIds.has(task.id) ? 'bg-brand-orange/5' : ''}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.has(task.id)}
                            onChange={() => handleTaskSelect(task.id)}
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-orange focus:ring-brand-orange/50 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{task.contact_name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{task.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{task.lender || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-600 dark:text-gray-300">{task.status || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{task.assigned_to_name || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {task.tw_completed ? (
                              <div className="flex items-center gap-1.5">
                                <CheckCircle size={12} className="text-green-500 shrink-0" />
                                <span className="text-[11px] text-green-500 font-medium">Task Completed by {task.completed_by_name || 'Unknown'}</span>
                              </div>
                            ) : task.tw_red_flag ? (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <Flag size={12} className="text-red-500 shrink-0" />
                                  <span className="text-[11px] text-red-500 font-medium">Red Flagged by {task.flagged_by_name || 'Unknown'}</span>
                                </div>
                                {task.originally_assigned_to_name && (
                                  <span className="text-[10px] text-gray-400 pl-[18px]">Assigned to: {task.originally_assigned_to_name}</span>
                                )}
                                {task.assigned_to_name && (
                                  <span className="text-[10px] text-blue-400 pl-[18px]">Now with: {task.assigned_to_name}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskWorkDashboard;
