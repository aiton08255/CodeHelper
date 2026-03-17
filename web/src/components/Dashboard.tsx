import { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
}

export function Dashboard({ onClose }: Props) {
  const [perf, setPerf] = useState<any>(null);
  const [kb, setKb] = useState<any>(null);
  const [changelog, setChangelog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('self-evo-token') || '';
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch('/api/evolution/performance', { headers }).then(r => r.json()),
      fetch('/api/evolution/kb-health', { headers }).then(r => r.json()),
      fetch('/api/evolution/changelog?limit=10', { headers }).then(r => r.json()),
    ]).then(([p, k, c]) => {
      setPerf(p);
      setKb(k);
      setChangelog(c.entries || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-slate-400 mt-8">Loading stats...</div>;

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Self-Evo Dashboard</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">Close</button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Queries" value={perf?.total_queries || 0} />
        <StatCard label="Success Rate" value={`${((perf?.success_rate || 0) * 100).toFixed(0)}%`} />
        <StatCard label="Avg Latency" value={`${((perf?.avg_latency_ms || 0) / 1000).toFixed(1)}s`} />
        <StatCard label="Avg Confidence" value={`${((perf?.avg_confidence || 0) * 100).toFixed(0)}%`} />
      </div>

      {/* KB Health */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Knowledge Base</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-400">Total Claims:</span> <span className="text-white">{kb?.total_claims || 0}</span></div>
          <div><span className="text-slate-400">Skill Rules:</span> <span className="text-blue-400">{kb?.skill_rules || 0}</span></div>
          <div><span className="text-slate-400">Research:</span> <span className="text-green-400">{kb?.research_claims || 0}</span></div>
          <div><span className="text-slate-400">Avg Confidence:</span> <span className="text-white">{((kb?.avg_confidence || 0) * 100).toFixed(0)}%</span></div>
        </div>
      </div>

      {/* By Depth */}
      {perf?.by_depth && Object.keys(perf.by_depth).length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Performance by Depth</h3>
          <div className="space-y-2">
            {Object.entries(perf.by_depth).map(([depth, data]: [string, any]) => (
              <div key={depth} className="flex items-center gap-3 text-sm">
                <span className="w-20 text-slate-400 capitalize">{depth}</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 rounded-full h-2"
                    style={{ width: `${(data.avg_confidence || 0) * 100}%` }}
                  />
                </div>
                <span className="text-white w-16 text-right">{((data.avg_confidence || 0) * 100).toFixed(0)}%</span>
                <span className="text-slate-500 w-20 text-right">{(data.avg_latency / 1000).toFixed(1)}s avg</span>
                <span className="text-slate-500 w-12 text-right">{data.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Sources */}
      {perf?.top_sources?.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Top Sources</h3>
          <div className="space-y-1 text-sm">
            {perf.top_sources.slice(0, 6).map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-slate-400 flex-1 truncate">{s.domain}</span>
                <span className="text-green-400 w-16 text-right">{(s.avg_quality * 100).toFixed(0)}%</span>
                <span className="text-slate-500 w-12 text-right">{s.usage_count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Evolution */}
      {changelog.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Recent Evolution</h3>
          <div className="space-y-2 text-xs">
            {changelog.slice(0, 5).map((e: any, i: number) => (
              <div key={i} className="flex gap-2 text-slate-400">
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  e.tier === 'silent' ? 'bg-slate-700 text-slate-400' :
                  e.tier === 'notify' ? 'bg-yellow-900 text-yellow-400' :
                  'bg-red-900 text-red-400'
                }`}>{e.change_type}</span>
                <span className="flex-1 truncate">{e.reason}</span>
                <span className="text-slate-600">{e.timestamp?.slice(0, 16)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
