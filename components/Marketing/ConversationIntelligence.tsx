import React, { useEffect, useState, useCallback } from 'react';
import {
  Brain, MessageCircle, Building2, CreditCard, HelpCircle,
  CheckCircle2, AlertCircle, RefreshCw, TrendingUp, Users
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface LenderMention { answer_value: string; count: number; }
interface CommonIntent { bot_intent_detected: string; count: number; }
interface CreditType { answer_value: string; count: number; }
interface QualRate { question_key: string; total: number; confirmed: number; inferred: number; unclear: number; }
interface SourceDist { source_platform: string; count: number; registered: number; }

const QUESTION_LABELS: Record<string, string> = {
  lender_name: 'Lender Name',
  credit_type: 'Credit Type',
  credit_start_date: 'Credit Start Date',
  credit_end_date: 'Credit End Date',
  gambling_at_time: 'Gambling at Time',
  still_owe_money: 'Still Owe Money',
  amount_borrowed: 'Amount Borrowed',
  financial_hardship: 'Financial Hardship',
  previous_claim: 'Previous Claim',
  full_name: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
};

const SOURCE_COLORS: Record<string, string> = {
  facebook_ad: '#3b82f6',
  instagram_ad: '#ec4899',
  tiktok_ad: '#ef4444',
  tiktok_organic: '#10b981',
  tiktok_spark: '#f59e0b',
  organic_search: '#8b5cf6',
  direct: '#6b7280',
  referral: '#14b8a6',
};

const ConversationIntelligence: React.FC = () => {
  const [lenderMentions, setLenderMentions] = useState<LenderMention[]>([]);
  const [commonIntents, setCommonIntents] = useState<CommonIntent[]>([]);
  const [creditTypes, setCreditTypes] = useState<CreditType[]>([]);
  const [qualRates, setQualRates] = useState<QualRate[]>([]);
  const [sourceDist, setSourceDist] = useState<SourceDist[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/chatbot/intelligence');
      if (res.ok) {
        const data = await res.json();
        setLenderMentions(data.lenderMentions || []);
        setCommonIntents(data.commonIntents || []);
        setCreditTypes(data.creditTypes || []);
        setQualRates(data.qualRates || []);
        setSourceDist(data.sourceDist || []);
      }
    } catch (err) {
      console.error('Failed to fetch intelligence:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalAnswers = qualRates.reduce((sum, q) => sum + Number(q.total), 0);
  const totalConfirmed = qualRates.reduce((sum, q) => sum + Number(q.confirmed), 0);
  const confirmedRate = totalAnswers > 0 ? ((totalConfirmed / totalAnswers) * 100).toFixed(1) : '0';
  const totalSources = sourceDist.reduce((sum, s) => sum + Number(s.count), 0);
  const totalRegistered = sourceDist.reduce((sum, s) => sum + Number(s.registered), 0);

  const lenderChartData = lenderMentions.slice(0, 10).map(l => ({
    lender: l.answer_value,
    mentions: Number(l.count),
  }));

  const creditChartData = creditTypes.map(c => ({
    name: c.answer_value,
    value: Number(c.count),
  }));

  const CREDIT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  const hasData = lenderMentions.length > 0 || commonIntents.length > 0 || qualRates.length > 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Lenders Mentioned" value={String(lenderMentions.length)} icon={Building2} color="blue" />
        <KPICard label="Questions Answered" value={totalAnswers.toLocaleString()} icon={HelpCircle} color="green" />
        <KPICard label="Confirmed Rate" value={`${confirmedRate}%`} icon={CheckCircle2} color="purple" />
        <KPICard label="Total Sources" value={String(totalSources)} icon={Users} color="orange" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Brain size={20} /> Conversation Intelligence
        </h2>
        <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <RefreshCw size={16} />
        </button>
      </div>

      {!hasData ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Brain size={48} className="mx-auto mb-3" />
          <p className="text-lg font-medium">No Intelligence Data Yet</p>
          <p className="text-sm mt-1">Data will appear once the chatbot qualifies leads.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lender Mentions */}
            {lenderChartData.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Building2 size={16} /> Top Lenders Mentioned
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={lenderChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="lender" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip />
                    <Bar dataKey="mentions" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Credit Types */}
            {creditChartData.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CreditCard size={16} /> Credit Types
                </h3>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={220}>
                    <PieChart>
                      <Pie
                        data={creditChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        dataKey="value"
                        nameKey="name"
                      >
                        {creditChartData.map((_, i) => (
                          <Cell key={i} fill={CREDIT_COLORS[i % CREDIT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {creditChartData.map((c, i) => (
                      <div key={c.name} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: CREDIT_COLORS[i % CREDIT_COLORS.length] }} />
                        <span className="text-gray-700 dark:text-gray-300 flex-1 truncate capitalize">{c.name}</span>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Common Questions / Intents */}
          {commonIntents.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <HelpCircle size={16} /> Common Questions & Intents
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {commonIntents.map((intent) => (
                  <div key={intent.bot_intent_detected} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{Number(intent.count)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize mt-0.5">
                      {intent.bot_intent_detected.replace(/_/g, ' ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Qualification Completion */}
          {qualRates.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Qualification Question Completion</h3>
              <div className="space-y-2">
                {qualRates.map((q) => {
                  const total = Number(q.total);
                  const confirmed = Number(q.confirmed);
                  const inferred = Number(q.inferred);
                  const unclear = Number(q.unclear);
                  const confirmedPct = total > 0 ? (confirmed / total) * 100 : 0;
                  const inferredPct = total > 0 ? (inferred / total) * 100 : 0;
                  const unclearPct = total > 0 ? (unclear / total) * 100 : 0;

                  return (
                    <div key={q.question_key} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-36 text-right flex-shrink-0">
                        {QUESTION_LABELS[q.question_key] || q.question_key}
                      </span>
                      <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-5 flex overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${confirmedPct}%` }} title={`Confirmed: ${confirmed}`} />
                        <div className="bg-amber-400 h-full" style={{ width: `${inferredPct}%` }} title={`Inferred: ${inferred}`} />
                        <div className="bg-red-400 h-full" style={{ width: `${unclearPct}%` }} title={`Unclear: ${unclear}`} />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right">{total}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 justify-center">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500" /> Confirmed</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-400" /> Inferred</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400" /> Unclear</span>
                </div>
              </div>
            </div>
          )}

          {/* Source Distribution */}
          {sourceDist.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <TrendingUp size={16} /> Conversations by Source
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {sourceDist.map((s) => {
                  const convRate = Number(s.count) > 0 ? ((Number(s.registered) / Number(s.count)) * 100).toFixed(1) : '0';
                  return (
                    <div key={s.source_platform} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SOURCE_COLORS[s.source_platform] || '#94a3b8' }} />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">
                          {(s.source_platform || '').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{Number(s.count)}</p>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>{s.registered} registered</span>
                        <span>{convRate}% conv</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConversationIntelligence;
