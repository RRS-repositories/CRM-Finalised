import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCw, Users, UserX, Calendar, Flag, CheckCircle } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { API_ENDPOINTS } from '../src/config';

interface TaskWorkClaim {
  id: number;
  contact_id: number;
  contact_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lender: string;
  status: string;
  claim_value: number | null;
  created_at: string;
  tw_assigned_to: number | null;
  tw_assigned_at: string | null;
  tw_completed: boolean;
  tw_completed_at: string | null;
  tw_red_flag: boolean;
  tw_red_flag_at: string | null;
  assigned_to_name: string | null;
}

interface AdminUser {
  id: number;
  fullName: string;
  role: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

const TaskWork: React.FC = () => {
  const { currentUser, addNotification } = useCRM();

  // Data state
  const [claims, setClaims] = useState<TaskWorkClaim[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [lenders, setLenders] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false });
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lenderFilter, setLenderFilter] = useState('');
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState('');

  // Access check
  if (currentUser?.role !== 'Management') {
    return (
      <div className="flex items-center justify-center h-full text-red-500 font-bold">
        Access Denied. Management privileges required.
      </div>
    );
  }

  const fetchClaims = useCallback(async (p = pagination.page, l = pagination.limit) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(l),
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(lenderFilter && { lender: lenderFilter }),
        ...(assignedToFilter && { assignedTo: assignedToFilter }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      });
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/claims?${params}`);
      const data = await res.json();
      setClaims(data.claims || []);
      setPagination(data.pagination || { page: p, limit: l, total: 0, totalPages: 0, hasMore: false });
    } catch (err) {
      console.error('Failed to fetch task work claims:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, lenderFilter, assignedToFilter, dateFrom, dateTo, pagination.page, pagination.limit]);

  const fetchFilterData = useCallback(async () => {
    try {
      const [adminsRes, lendersRes, statusesRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.api}/task-work/admins`),
        fetch(`${API_ENDPOINTS.api}/task-work/lenders`),
        fetch(`${API_ENDPOINTS.api}/task-work/statuses`),
      ]);
      const [adminsData, lendersData, statusesData] = await Promise.all([
        adminsRes.json(), lendersRes.json(), statusesRes.json()
      ]);
      setAdmins(adminsData.admins || []);
      setLenders(lendersData.lenders || []);
      setStatuses(statusesData.statuses || []);
    } catch (err) {
      console.error('Failed to fetch filter data:', err);
    }
  }, []);

  useEffect(() => {
    fetchFilterData();
  }, [fetchFilterData]);

  useEffect(() => {
    fetchClaims(1, pagination.limit);
  }, [search, statusFilter, lenderFilter, assignedToFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchClaims();
  }, [pagination.page, pagination.limit]);

  const handleSelectAll = () => {
    if (selectedIds.size === claims.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(claims.map(c => c.id)));
    }
  };

  const handleSelectOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0 || !selectedAgent) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds: Array.from(selectedIds), adminId: parseInt(selectedAgent) }),
      });
      const data = await res.json();
      if (data.success) {
        addNotification('success', `Assigned ${data.assigned} claims successfully`);
        setSelectedIds(new Set());
        setSelectedAgent('');
        fetchClaims();
      }
    } catch (err) {
      addNotification('error', 'Failed to assign claims');
    }
  };

  const handleUnassign = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        addNotification('success', `Unassigned ${data.unassigned} claims successfully`);
        setSelectedIds(new Set());
        fetchClaims();
      }
    } catch (err) {
      addNotification('error', 'Failed to unassign claims');
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
      setSelectedIds(new Set());
    }
  };

  const handleLimitChange = (newLimit: number) => {
    setPagination(prev => ({ ...prev, limit: newLimit, page: 1 }));
    setSelectedIds(new Set());
  };

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const statusColor = (status: string | null) => {
    if (!status) return 'bg-gray-500/20 text-gray-400';
    const s = status.toLowerCase();
    if (s.includes('sale') || s.includes('successful') || s.includes('paid')) return 'bg-green-500/20 text-green-400';
    if (s.includes('awaiting') || s.includes('pending') || s.includes('sent')) return 'bg-orange-500/20 text-orange-400';
    if (s.includes('signed') || s.includes('uploaded') || s.includes('received')) return 'bg-yellow-500/20 text-yellow-400';
    if (s.includes('callback') || s.includes('overdue')) return 'bg-red-500/20 text-red-400';
    if (s.includes('new') || s.includes('contact')) return 'bg-blue-500/20 text-blue-400';
    return 'bg-gray-500/20 text-gray-400';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '-';
    return `£${val.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
  };

  const startIdx = (pagination.page - 1) * pagination.limit + 1;
  const endIdx = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-surface-900 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Task Assigner</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{pagination.total.toLocaleString()} claims</span>
          <button
            onClick={() => fetchClaims()}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 transition-all"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search claims, contacts, lenders..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-surface-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange/50 transition-all"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
              filtersOpen
                ? 'bg-brand-orange/10 text-brand-orange border-brand-orange/30'
                : 'bg-white dark:bg-surface-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            <Filter size={16} />
            Filters
          </button>
        </div>

        {/* Filter Dropdowns */}
        {filtersOpen && (
          <div className="flex flex-wrap items-end gap-4 p-4 bg-white dark:bg-surface-800 rounded-lg border border-gray-200 dark:border-white/10">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-gray-100 dark:bg-surface-900 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 min-w-[160px]"
              >
                <option value="">All Statuses</option>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Lender</label>
              <select
                value={lenderFilter}
                onChange={e => setLenderFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-gray-100 dark:bg-surface-900 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 min-w-[160px]"
              >
                <option value="">All Lenders</option>
                {lenders.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Assigned To</label>
              <select
                value={assignedToFilter}
                onChange={e => setAssignedToFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-gray-100 dark:bg-surface-900 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 min-w-[160px]"
              >
                <option value="">All Agents</option>
                <option value="unassigned">Unassigned</option>
                {admins.map(a => <option key={a.id} value={String(a.id)}>{a.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Date From</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-surface-900 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Date To</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-surface-900 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                />
              </div>
            </div>
            {(statusFilter || lenderFilter || assignedToFilter || dateFrom || dateTo) && (
              <button
                onClick={() => { setStatusFilter(''); setLenderFilter(''); setAssignedToFilter(''); setDateFrom(''); setDateTo(''); }}
                className="px-3 py-2 text-sm text-red-500 hover:text-red-400 font-medium transition-all"
              >
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-3 px-4 py-3 bg-yellow-500/10 dark:bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
        <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
          {selectedIds.size} selected
        </span>
        <div className="flex items-center gap-3">
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            className="px-3 py-2 text-sm bg-white dark:bg-surface-800 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 min-w-[180px]"
          >
            <option value="">Select Agent</option>
            {admins.map(a => <option key={a.id} value={String(a.id)}>{a.fullName}</option>)}
          </select>
          <button
            onClick={handleAssign}
            disabled={selectedIds.size === 0 || !selectedAgent}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Users size={16} />
            Assign
          </button>
          <button
            onClick={handleUnassign}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <UserX size={16} />
            Unassign
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-surface-900 z-10">
              <tr className="border-b border-gray-200 dark:border-white/5">
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={claims.length > 0 && selectedIds.size === claims.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-orange focus:ring-brand-orange/50 cursor-pointer"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Contact</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Lender</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Claim Value</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Date</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Assigned To</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 w-20">Flags</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-3 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Loading claims...</p>
                    </div>
                  </td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-gray-500 dark:text-gray-400">
                    No claims found
                  </td>
                </tr>
              ) : (
                claims.map(claim => (
                  <tr
                    key={claim.id}
                    className={`border-b border-gray-100 dark:border-white/5 transition-all hover:bg-gray-50 dark:hover:bg-white/5 ${
                      selectedIds.has(claim.id) ? 'bg-brand-orange/5 dark:bg-brand-orange/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(claim.id)}
                        onChange={() => handleSelectOne(claim.id)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-orange focus:ring-brand-orange/50 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{claim.contact_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{claim.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{claim.lender || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {claim.status ? (
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColor(claim.status)}`}>
                          {claim.status}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatCurrency(claim.claim_value)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{formatDate(claim.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {claim.assigned_to_name || <span className="text-gray-400 italic">Unassigned</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {claim.tw_completed && (
                          <span title="Task Completed" className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20">
                            <CheckCircle size={14} className="text-green-500" />
                          </span>
                        )}
                        {claim.tw_red_flag && (
                          <span title="Red Flagged" className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20">
                            <Flag size={14} className="text-red-500" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-surface-900 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {pagination.total > 0 ? `${startIdx}-${endIdx} of ${pagination.total.toLocaleString()}` : '0 results'}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">Per page:</span>
              {[20, 50, 100, 250, 500].map(n => (
                <button
                  key={n}
                  onClick={() => handleLimitChange(n)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    pagination.limit === n
                      ? 'bg-brand-orange/10 text-brand-orange'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/5'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasMore}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskWork;
