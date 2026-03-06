import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, RefreshCw, Check, Flag, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { API_ENDPOINTS } from '../src/config';
import { ClaimStatus } from '../types';
import { PIPELINE_CATEGORIES } from '../constants';

interface AssignedClaim {
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
  tw_assigned_at: string | null;
  tw_completed: boolean;
  tw_completed_at: string | null;
  tw_red_flag: boolean;
  tw_red_flag_at: string | null;
  last_note: string | null;
  documents_count: number;
}

interface Summary {
  totalTasks: number;
  completedCount: number;
  awaitingCount: number;
  flaggedCount: number;
  documentsCount: number;
}

type SortField = 'name' | 'lender' | 'status';
type SortDir = 'asc' | 'desc';

const CATEGORY_BG_COLORS: Record<string, string> = {
  'lead-generation': 'bg-blue-600',
  'onboarding': 'bg-purple-600',
  'dsar-process': 'bg-yellow-600',
  'complaint': 'bg-orange-600',
  'fos-escalation': 'bg-red-600',
  'payments': 'bg-green-600',
  'debt-recovery': 'bg-cyan-600',
};

const CATEGORY_DOT_COLORS: Record<string, string> = {
  'lead-generation': 'bg-blue-400',
  'onboarding': 'bg-purple-400',
  'dsar-process': 'bg-yellow-400',
  'complaint': 'bg-orange-400',
  'fos-escalation': 'bg-red-400',
  'payments': 'bg-green-400',
  'debt-recovery': 'bg-cyan-400',
};

const MyTasks: React.FC = () => {
  const { currentUser, addNotification } = useCRM();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<AssignedClaim[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalTasks: 0, completedCount: 0, awaitingCount: 0, flaggedCount: 0, documentsCount: 0 });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState<number | null>(null);

  if (!currentUser || currentUser.role === 'Sales') {
    return (
      <div className="flex items-center justify-center h-full text-red-500 font-bold">
        Access Denied.
      </div>
    );
  }

  const fetchMyTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/my-tasks?userId=${currentUser.id}`);
      const data = await res.json();
      setClaims(data.claims || []);
      setSummary(data.summary || { totalTasks: 0, completedCount: 0, awaitingCount: 0, flaggedCount: 0, documentsCount: 0 });
    } catch (err) {
      console.error('Failed to fetch my tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => { fetchMyTasks(); }, [fetchMyTasks]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleComplete = async (claimId: number) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, userId: currentUser.id }),
      });
      const data = await res.json();
      if (data.success) {
        addNotification('success', 'Task marked as completed');
        fetchMyTasks();
      } else addNotification('error', data.error || 'Failed to complete task');
    } catch { addNotification('error', 'Failed to complete task'); }
  };

  const handleRedFlag = async (claimId: number) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/task-work/red-flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, userId: currentUser.id }),
      });
      const data = await res.json();
      if (data.success) {
        addNotification('info', 'Task red flagged');
        fetchMyTasks();
      } else addNotification('error', data.error || 'Failed to red flag task');
    } catch { addNotification('error', 'Failed to red flag task'); }
  };

  const openContact = (contactId: number) => {
    navigate(`/contacts/${contactId}`);
  };

  const handleStatusChange = async (claimId: number, newStatus: string) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/cases/${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success !== false) {
        addNotification('success', `Status updated to ${newStatus}`);
        fetchMyTasks();
      } else {
        addNotification('error', data.error || 'Failed to update status');
      }
    } catch {
      addNotification('error', 'Failed to update status');
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const statusColor = (status: string | null) => {
    if (!status) return { dot: 'bg-gray-400', text: 'text-gray-400' };
    const s = status.toLowerCase();
    if (s.includes('sale') || s.includes('successful') || s.includes('paid') || s.includes('complete')) return { dot: 'bg-green-500', text: 'text-green-400' };
    if (s.includes('awaiting') || s.includes('pending') || s.includes('callback')) return { dot: 'bg-amber-500', text: 'text-amber-400' };
    if (s.includes('sent') || s.includes('submitted')) return { dot: 'bg-orange-500', text: 'text-orange-400' };
    if (s.includes('signed') || s.includes('uploaded') || s.includes('received')) return { dot: 'bg-yellow-500', text: 'text-yellow-400' };
    if (s.includes('overdue') || s.includes('reject') || s.includes('fail')) return { dot: 'bg-red-500', text: 'text-red-400' };
    if (s.includes('new') || s.includes('contact') || s.includes('lead')) return { dot: 'bg-blue-500', text: 'text-blue-400' };
    return { dot: 'bg-gray-400', text: 'text-gray-400' };
  };

  // Filter + search + sort
  let filtered = claims.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.contact_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q) || c.lender?.toLowerCase().includes(q));
    }
    return true;
  });

  if (sortField) {
    filtered = [...filtered].sort((a, b) => {
      let va = '', vb = '';
      if (sortField === 'name') { va = a.contact_name || ''; vb = b.contact_name || ''; }
      else if (sortField === 'lender') { va = a.lender || ''; vb = b.lender || ''; }
      else if (sortField === 'status') { va = a.status || ''; vb = b.status || ''; }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  const uniqueStatuses = [...new Set(claims.map(c => c.status).filter(Boolean))].sort();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown size={12} className="opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0e1a] text-white overflow-hidden">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 p-6 pb-4">
        <div className="bg-[#111827] border border-white/10 rounded-xl p-5 text-center">
          <p className="text-sm font-medium text-gray-400 mb-1">Tasks Completed</p>
          <p className="text-3xl font-bold text-green-400">{summary.completedCount}</p>
        </div>
        <div className="bg-[#111827] border border-white/10 rounded-xl p-5 text-center">
          <p className="text-sm font-medium text-gray-400 mb-1">Tasks Awaiting</p>
          <p className="text-3xl font-bold text-amber-400">{summary.awaitingCount}</p>
        </div>
        <div className="bg-[#111827] border border-white/10 rounded-xl p-5 text-center">
          <p className="text-sm font-medium text-gray-400 mb-1">Tasks Flagged</p>
          <p className="text-3xl font-bold text-red-400">{summary.flaggedCount}</p>
        </div>
        <div className="bg-[#111827] border border-white/10 rounded-xl p-5 text-center">
          <p className="text-sm font-medium text-gray-400 mb-1">Documents Sent</p>
          <p className="text-3xl font-bold text-blue-400">{summary.documentsCount}</p>
        </div>
      </div>

      {/* Toolbar: Search + Filters */}
      <div className="px-6 pb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name, phone, email"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#111827] border border-white/10 rounded-lg text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange/50 transition-all"
          />
        </div>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
            filtersOpen
              ? 'bg-brand-orange/10 text-brand-orange border-brand-orange/30'
              : 'bg-[#111827] text-gray-400 border-white/10 hover:bg-white/5 hover:text-gray-200'
          }`}
        >
          <Filter size={16} />
          Filters
        </button>
        <button
          onClick={() => fetchMyTasks()}
          className="p-2.5 rounded-lg text-gray-400 hover:text-white bg-[#111827] border border-white/10 hover:bg-white/5 transition-all"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {filtersOpen && (
        <div className="px-6 pb-4">
          <div className="flex items-center gap-4 p-4 bg-[#111827] rounded-lg border border-white/10">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-[#0a0e1a] border border-white/10 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 min-w-[180px]"
              >
                <option value="">All Statuses</option>
                {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {statusFilter && (
              <button onClick={() => setStatusFilter('')} className="text-xs text-red-400 hover:text-red-300 font-medium mt-5">Clear</button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 mx-6 mb-4 bg-[#111827] rounded-xl border border-white/10 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0d1320] z-10">
              <tr className="border-b border-white/10">
                <th
                  className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-gray-300 select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">NAME <SortIcon field="name" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">PHONE</th>
                <th
                  className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-gray-300 select-none"
                  onClick={() => handleSort('lender')}
                >
                  <div className="flex items-center gap-1">LENDER <SortIcon field="lender" /></div>
                </th>
                <th
                  className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-gray-300 select-none"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">STATUS <SortIcon field="status" /></div>
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">LAST NOTE</th>
                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">TASK STATUS</th>
                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-3 border-blue-900 border-t-blue-400 rounded-full animate-spin" />
                      <p className="text-sm text-gray-500">Loading your tasks...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-20 text-gray-500">
                    {search ? 'No matching tasks found' : 'No tasks assigned to you'}
                  </td>
                </tr>
              ) : (
                filtered.map(claim => {
                  const sc = statusColor(claim.status);
                  return (
                    <tr
                      key={claim.id}
                      className="border-b border-white/5 transition-all hover:bg-white/[0.03] group"
                    >
                      {/* NAME with avatar - double click to open */}
                      <td className="px-4 py-3 cursor-pointer" onDoubleClick={() => openContact(claim.contact_id)}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {getInitials(claim.contact_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate hover:text-blue-400 transition-colors">{claim.contact_name}</p>
                            <p className="text-xs text-gray-500 truncate">{claim.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* PHONE */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-400">{claim.phone || '\u2014'}</span>
                      </td>

                      {/* LENDER */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-300">{claim.lender || '\u2014'}</span>
                      </td>

                      {/* STATUS dropdown */}
                      <td className="px-4 py-3 relative">
                        <button
                          onClick={() => setStatusDropdownOpen(statusDropdownOpen === claim.id ? null : claim.id)}
                          className="inline-flex items-center gap-1.5 text-sm hover:bg-white/5 rounded px-2 py-1 transition-colors"
                        >
                          <span className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />
                          <span className={sc.text}>{claim.status || '\u2014'}</span>
                          <ChevronDown size={12} className="text-gray-600 ml-0.5" />
                        </button>
                        {statusDropdownOpen === claim.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setStatusDropdownOpen(null)} />
                            <div className="absolute left-4 top-full mt-1 z-50 w-72 bg-[#1a2236] border border-white/15 rounded-xl shadow-2xl overflow-hidden">
                              <div className="px-4 py-2.5 border-b border-white/10">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Change Status</p>
                              </div>
                              <div className="max-h-80 overflow-y-auto">
                                {PIPELINE_CATEGORIES.map(cat => (
                                  <div key={cat.id}>
                                    <div className={`px-4 py-2 text-xs font-bold text-white uppercase tracking-wider ${CATEGORY_BG_COLORS[cat.id] || 'bg-gray-600'}`}>
                                      {cat.title}
                                    </div>
                                    {cat.statuses.map(status => (
                                      <button
                                        key={status}
                                        onClick={() => {
                                          handleStatusChange(claim.id, status);
                                          setStatusDropdownOpen(null);
                                        }}
                                        className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                                          claim.status === status
                                            ? 'bg-white/10 text-white font-medium'
                                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                        }`}
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT_COLORS[cat.id] || 'bg-gray-400'} shrink-0`} />
                                        {status}
                                      </button>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </td>

                      {/* LAST NOTE */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500 truncate block max-w-[200px]">
                          {claim.last_note || '\u2014'}
                        </span>
                      </td>

                      {/* TASK STATUS - action icons */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {claim.tw_completed ? (
                            <div className="w-10 h-10 rounded-lg bg-green-600/20 border border-green-500/30 flex items-center justify-center" title="Task Completed">
                              <Check size={20} className="text-green-400" strokeWidth={3} />
                            </div>
                          ) : claim.tw_red_flag ? (
                            <div className="w-10 h-10 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center" title="Red Flagged">
                              <Flag size={18} className="text-red-400 fill-red-400" />
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleComplete(claim.id)}
                                className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-green-600/20 hover:border-green-500/30 transition-all group/btn"
                                title="Mark as Completed"
                              >
                                <Check size={18} className="text-gray-500 group-hover/btn:text-green-400" strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={() => handleRedFlag(claim.id)}
                                className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-600/20 hover:border-red-500/30 transition-all group/btn"
                                title="Red Flag"
                              >
                                <Flag size={16} className="text-gray-500 group-hover/btn:text-red-400" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      {/* OPEN button */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openContact(claim.contact_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-orange/10 text-brand-orange border border-brand-orange/20 hover:bg-brand-orange/20 hover:border-brand-orange/40 transition-all"
                        >
                          <ExternalLink size={13} />
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-white/10 bg-[#0d1320] shrink-0">
          <span className="text-sm text-gray-500">Showing {filtered.length} items</span>
        </div>
      </div>
    </div>
  );
};

export default MyTasks;
