interface Source {
  url: string;
  title: string;
  quality: number;
}

interface ReportData {
  query: string;
  depth: string;
  executive_summary: string;
  findings: string;
  limitations: string;
  sources: Source[];
  overall_confidence: number;
  claims: any[];
}

interface Props {
  report: ReportData;
  onNewSearch: () => void;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                pct >= 60 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                'bg-red-500/20 text-red-400 border-red-500/30';
  const label = pct >= 80 ? 'High' : pct >= 60 ? 'Moderate' : 'Low';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label} ({pct}%)
    </span>
  );
}

function QualityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Report({ report, onNewSearch }: Props) {
  return (
    <div className="w-full max-w-4xl mx-auto mt-8 space-y-6">
      {/* Header */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{report.query}</h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-slate-400">Depth: {report.depth}</span>
              <ConfidenceBadge value={report.overall_confidence} />
              <span className="text-sm text-slate-400">{report.claims.length} claims from {report.sources.length} sources</span>
            </div>
          </div>
          <button
            onClick={onNewSearch}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
          >
            New Search
          </button>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-blue-500/30">
        <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-2">Executive Summary</h3>
        <p className="text-white leading-relaxed whitespace-pre-wrap">{report.executive_summary.replace(/^\*+\s*/, '').trim()}</p>
      </div>

      {/* Findings */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Findings</h3>
        <div className="text-slate-200 leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none">
          {report.findings}
        </div>
      </div>

      {/* Sources */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Sources ({report.sources.length})</h3>
        <div className="space-y-3">
          {report.sources.map((source, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-6">[{i + 1}]</span>
              <QualityBar value={source.quality} />
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 truncate flex-1"
              >
                {source.url}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Limitations */}
      {report.limitations && (
        <div className="bg-slate-800 rounded-2xl p-6 border border-amber-500/30">
          <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-2">What Could Not Be Determined</h3>
          <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{report.limitations}</p>
        </div>
      )}
    </div>
  );
}
