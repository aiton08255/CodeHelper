import { useState } from 'react';

type Depth = 'auto' | 'instant' | 'quick' | 'standard' | 'deep';

const DEPTH_INFO: Record<Depth, { label: string; hint: string }> = {
  auto:     { label: 'Auto',     hint: 'Smart — picks the right depth' },
  instant:  { label: 'Instant',  hint: '~2s — simple facts' },
  quick:    { label: 'Quick',    hint: '~10s — moderate questions' },
  standard: { label: 'Standard', hint: '~20s — comparisons & analysis' },
  deep:     { label: 'Deep',     hint: '~35s — full research' },
};

interface Props {
  onSearch: (query: string, depth: Depth) => void;
  disabled?: boolean;
}

export function SearchBar({ onSearch, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<Depth>('auto');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onSearch(query.trim(), depth);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ask anything..."
          disabled={disabled}
          className="w-full px-5 py-4 pr-28 bg-slate-800 border border-slate-600 rounded-2xl text-white placeholder-slate-400 text-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !query.trim()}
          className="absolute right-2 top-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded-xl font-medium transition-colors"
        >
          {disabled ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className="flex gap-2 mt-3 justify-center flex-wrap">
        {(Object.keys(DEPTH_INFO) as Depth[]).map(d => (
          <button
            key={d}
            type="button"
            onClick={() => setDepth(d)}
            title={DEPTH_INFO[d].hint}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              depth === d
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {DEPTH_INFO[d].label}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500 mt-1">{DEPTH_INFO[depth].hint}</p>
    </form>
  );
}
