import { useState, useEffect } from 'react';

interface HistoryEntry {
  id: number;
  query_text: string;
  depth_level: string;
  satisfaction_score: number;
  latency_ms: number;
  timestamp: string;
}

interface Props {
  onSelect: (query: string, depth: string) => void;
}

export function SearchHistory({ onSelect }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('self-evo-token') || '';
    fetch('/api/research/history?limit=10', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { setHistory(d.results || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || history.length === 0) return null;

  return (
    <div className="w-full max-w-3xl mx-auto mt-6">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent Searches</h3>
      <div className="flex flex-wrap gap-2">
        {history.map((h) => (
          <button
            key={h.id}
            onClick={() => onSelect(h.query_text, h.depth_level)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-xs transition-all truncate max-w-[200px]"
            title={`${h.query_text} (${h.depth_level}, ${((h.satisfaction_score || 0) * 100).toFixed(0)}% confidence)`}
          >
            {h.query_text.slice(0, 40)}{h.query_text.length > 40 ? '...' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
