import React, { useEffect, useState, useRef } from 'react';
import {
  Brain, RefreshCw, Send, Sparkles, AlertTriangle, TrendingUp,
  TrendingDown, CheckCircle2, ChevronDown, ChevronUp, Lightbulb
} from 'lucide-react';

interface AIReport {
  id: string;
  report_date: string;
  report_type: string;
  platform: string;
  analysis: string;
  recommendations: any[];
  flagged_campaigns: any[];
  top_performers: any[];
  underperformers: any[];
  suggested_actions: any[];
  created_at: string;
}

const REPORT_TYPES = [
  { value: 'daily_review', label: 'Daily Review' },
  { value: 'budget_recommendation', label: 'Budget Recommendations' },
  { value: 'creative_analysis', label: 'Creative Analysis' },
  { value: 'anomaly_alert', label: 'Anomaly Detection' },
  { value: 'weekly_summary', label: 'Weekly Summary' },
];

const AICommandCentre: React.FC = () => {
  const [reports, setReports] = useState<AIReport[]>([]);
  const [latestReports, setLatestReports] = useState<AIReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedType, setSelectedType] = useState('daily_review');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  // Ask Claude
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [chatHistory, setChatHistory] = useState<{ q: string; a: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [latestRes, allRes] = await Promise.all([
        fetch('/api/marketing/ai-reports/latest'),
        fetch('/api/marketing/ai-reports?limit=10'),
      ]);
      if (latestRes.ok) setLatestReports(await latestRes.json());
      if (allRes.ok) setReports(await allRes.json());
    } catch (err) {
      console.error('AI reports fetch error:', err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/marketing/ai-reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: selectedType, platform: 'all' }),
      });
      if (res.ok) {
        await fetchReports();
      }
    } catch (err) {
      console.error('Report generation error:', err);
    }
    setGenerating(false);
  };

  const askClaude = async () => {
    if (!question.trim()) return;
    setAsking(true);
    const q = question;
    setQuestion('');
    try {
      const res = await fetch('/api/marketing/ai-reports/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(prev => [...prev, { q, a: data.answer }]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { q, a: 'Error: Could not get a response. Please try again.' }]);
    }
    setAsking(false);
  };

  const formatArray = (arr: any[]) => {
    if (!arr || !arr.length) return null;
    return arr.map((item, i) => (
      <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
        {typeof item === 'string' ? item : JSON.stringify(item)}
      </li>
    ));
  };

  if (loading && !latestReports.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading AI reports...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Generate Report + Latest Summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Generate Report */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Brain className="text-purple-500" size={20} />
                <h3 className="font-semibold text-gray-900 dark:text-white">Generate AI Report</h3>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300"
                >
                  {REPORT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={generateReport}
                  disabled={generating}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {generating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {generating ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>

            {/* Latest report display */}
            {latestReports.length > 0 ? (
              <div className="space-y-3">
                {latestReports.slice(0, 3).map((report) => (
                  <div key={report.id} className="border border-gray-100 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 uppercase">
                          {report.report_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(report.created_at).toLocaleDateString('en-GB')}</span>
                      </div>
                      {expandedReport === report.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </button>
                    {expandedReport === report.id && (
                      <div className="px-4 pb-4 space-y-3">
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{report.analysis}</p>
                        {report.recommendations?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1"><Lightbulb size={12} /> Recommendations</p>
                            <ul className="list-disc list-inside space-y-1">{formatArray(report.recommendations)}</ul>
                          </div>
                        )}
                        {report.suggested_actions?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1"><CheckCircle2 size={12} /> Actions</p>
                            <ul className="list-disc list-inside space-y-1">{formatArray(report.suggested_actions)}</ul>
                          </div>
                        )}
                        {report.flagged_campaigns?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-red-500 uppercase mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Flagged</p>
                            <ul className="list-disc list-inside space-y-1">{formatArray(report.flagged_campaigns)}</ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                No AI reports generated yet. Click "Generate" to create your first analysis.
              </div>
            )}
          </div>

          {/* Report History */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">Report History</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-slate-700">
              {reports.length > 0 ? reports.map((r) => (
                <div key={r.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 uppercase">
                      {r.report_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">{r.analysis?.slice(0, 100)}...</span>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              )) : (
                <div className="px-6 py-8 text-center text-gray-400 text-sm">No reports yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Ask Claude Chat Panel */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm flex flex-col h-[600px]">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
              <Brain className="text-purple-500" size={16} />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Ask Claude</h3>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {chatHistory.length === 0 && (
                <div className="text-center py-8">
                  <Brain className="mx-auto text-gray-300 dark:text-gray-600 mb-2" size={32} />
                  <p className="text-sm text-gray-400">Ask anything about your ad performance.</p>
                  <div className="mt-3 space-y-1">
                    {['What are my best performing campaigns?', 'Why did CPL increase this week?', 'Should I increase budget on Meta?'].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setQuestion(q)}
                        className="block w-full text-left text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatHistory.map((entry, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="bg-blue-600 text-white text-sm px-3 py-2 rounded-xl rounded-br-sm max-w-[85%]">
                      {entry.q}
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 text-sm px-3 py-2 rounded-xl rounded-bl-sm max-w-[85%] whitespace-pre-wrap">
                      {entry.a}
                    </div>
                  </div>
                </div>
              ))}
              {asking && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-slate-700 text-gray-400 text-sm px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin" /> Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 dark:border-slate-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && askClaude()}
                  placeholder="Ask about your ad performance..."
                  disabled={asking}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none disabled:opacity-50"
                />
                <button
                  onClick={askClaude}
                  disabled={asking || !question.trim()}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AICommandCentre;
