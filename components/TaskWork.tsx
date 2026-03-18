import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Filter, RefreshCw, Users, UserX, Calendar, Flag, CheckCircle, X, Loader2 } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { API_ENDPOINTS } from '../src/config';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

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
  tw_completed_by: number | null;
  tw_red_flag: boolean;
  tw_red_flag_at: string | null;
  tw_red_flag_by: number | null;
  tw_originally_assigned_to: number | null;
  assigned_to_name: string | null;
  completed_by_name: string | null;
  flagged_by_name: string | null;
  originally_assigned_to_name: string | null;
}

interface AdminUser {
  id: number;
  fullName: string;
  role: string;
}

const BATCH_SIZE = 50;

const TaskWork: React.FC = () => {
  const { currentUser, addNotification } = useCRM();

  // Data state
  const [claims, setClaims] = useState<TaskWorkClaim[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [lenders, setLenders] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lenderFilter, setLenderFilter] = useState('');
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flagFilter, setFlagFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState('');

  // Prevent concurrent fetches
  const fetchingRef = useRef(false);

  // Access check
  if (currentUser?.role !== 'Management') {
    return (
      <div className="flex items-center justify-center h-full text-red-500 font-bold">
        Access Denied. Management privileges required.
      </div>
    );
  }

  const buildParams = useCallback((page: number) => {
    return new URLSearchParams({
      page: String(page),
      limit: String(BATCH_SIZE),
      ...(search && { search }),
      ...(statusFilter && { status: statusFilter }),
      ...(lenderFilter && { lender: lenderFilter }),
      ...(assignedToFilter && { assignedTo: assignedToFilter }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(flagFilter && { flagFilter }),
    });
  }, [search, statusFilter, lenderFilter, assignedToFilter, dateFrom, dateTo, flagFilter]);

  // Initial fetch (replaces claims)
  const fetchClaims = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const params = buildParams(1);
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/claims?${params}`);
      const data = await res.json();
      setClaims(data.claims || []);
      const pag = data.pagination || { total: 0, hasMore: false };
      setTotal(pag.total || 0);
      setHasMore(pag.hasMore || false);
    } catch (err) {
      console.error('Failed to fetch task work claims:', err);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [buildParams]);

  // Load more (appends claims)
  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = Math.floor(claims.length / BATCH_SIZE) + 1;
      const params = buildParams(nextPage);
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/claims?${params}`);
      const data = await res.json();
      const newClaims = data.claims || [];
      setClaims(prev => [...prev, ...newClaims]);
      const pag = data.pagination || { total: 0, hasMore: false };
      setTotal(pag.total || 0);
      setHasMore(pag.hasMore || false);
    } catch (err) {
      console.error('Failed to load more claims:', err);
    } finally {
      fetchingRef.current = false;
      setLoadingMore(false);
    }
  }, [buildParams, claims.length, hasMore]);

  const { sentinelRef, scrollContainerRef } = useInfiniteScroll({
    hasMore,
    isLoading: loadingMore,
    onLoadMore: loadMore,
  });

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

  // Fetch on filter change — reset list
  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

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

  const handleUnflag = async (claimId: number) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/unflag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, userId: currentUser.id }),
      });
      const data = await res.json();
      if (data.success) {
        addNotification('success', 'Red flag removed');
        fetchClaims();
      }
    } catch {
      addNotification('error', 'Failed to unflag task');
    }
  };

  const handleBulkUnflag = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/unflag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds: Array.from(selectedIds), userId: currentUser.id }),
      });
      const data = await res.json();
      if (data.success) {
        addNotification('success', `Unflagged ${data.unflagged} claims successfully`);
        setSelectedIds(new Set());
        fetchClaims();
      }
    } catch {
      addNotification('error', 'Failed to bulk unflag claims');
    }
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
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-surface-900 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Task Assigner</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{total.toLocaleString()} claims</span>
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
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Flag Status</label>
              <select
                value={flagFilter}
                onChange={e => setFlagFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-gray-100 dark:bg-surface-900 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 min-w-[160px]"
              >
                <option value="">All</option>
                <option value="completed">Task Completed</option>
                <option value="red_flagged">Red Flagged</option>
              </select>
            </div>
            {(statusFilter || lenderFilter || assignedToFilter || dateFrom || dateTo || flagFilter) && (
              <button
                onClick={() => { setStatusFilter(''); setLenderFilter(''); setAssignedToFilter(''); setDateFrom(''); setDateTo(''); setFlagFilter(''); }}
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
          <button
            onClick={handleBulkUnflag}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <X size={16} />
            Unflag
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white dark:bg-surface-800 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden flex flex-col">
        <div ref={scrollContainerRef} className="overflow-auto flex-1">
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
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Date</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Assigned To</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 min-w-[180px]">Flags</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-3 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Loading claims...</p>
                    </div>
                  </td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-20 text-gray-500 dark:text-gray-400">
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
                    <td className="px-4 py-3 cursor-pointer" onDoubleClick={() => window.open(`/contacts/${claim.contact_id}`, '_blank')}>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-500 transition-colors">{claim.contact_name}</p>
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
                      <span className="text-sm text-gray-500 dark:text-gray-400">{formatDate(claim.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {claim.assigned_to_name || <span className="text-gray-400 italic">Unassigned</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {claim.tw_completed ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle size={12} className="text-green-500 shrink-0" />
                            <span className="text-[11px] text-green-500 font-medium leading-tight">
                              Task Completed by {claim.completed_by_name || 'Unknown'}
                            </span>
                          </div>
                        ) : claim.tw_red_flag ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <Flag size={12} className="text-red-500 shrink-0" />
                              <span className="text-[11px] text-red-500 font-medium leading-tight">
                                Red Flagged by {claim.flagged_by_name || 'Unknown'}
                              </span>
                            </div>
                            {claim.originally_assigned_to_name && (
                              <span className="text-[10px] text-gray-400 leading-tight pl-[18px]">
                                Assigned to: {claim.originally_assigned_to_name}
                              </span>
                            )}
                            {claim.assigned_to_name && (
                              <span className="text-[10px] text-blue-400 leading-tight pl-[18px]">
                                Now with: {claim.assigned_to_name}
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUnflag(claim.id); }}
                              className="flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-400 font-medium pl-[18px] w-fit"
                            >
                              <X size={10} />
                              Unflag
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading more claims...</span>
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {hasMore && !loading && <div ref={sentinelRef} className="h-1" />}
        </div>

        {/* Status Footer */}
        <div className="flex items-center justify-center px-4 py-2 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-surface-900 shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing {claims.length} of {total.toLocaleString()} claims
          </span>
        </div>
      </div>
    </div>
  );
};

export default TaskWork;
