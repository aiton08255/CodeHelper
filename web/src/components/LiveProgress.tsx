interface StageEvent {
  type: string;
  stage?: string;
  detail?: string;
  progress?: number;
  url?: string;
  title?: string;
  claim?: string;
  confidence?: number;
  message?: string;
  provider?: string;
  usage_pct?: number;
}

const STAGE_NAMES: Record<string, string> = {
  recall: 'Checking Memory',
  plan: 'Planning Research',
  search: 'Searching',
  triage: 'Scoring Sources',
  extract: 'Reading Sources',
  verify: 'Verifying Facts',
  gapfill: 'Filling Gaps',
  reason: 'Reasoning',
  compose: 'Writing Report',
  store: 'Saving Knowledge',
};

const STAGE_ORDER = ['recall', 'plan', 'search', 'triage', 'extract', 'verify', 'gapfill', 'reason', 'compose', 'store'];

interface Props {
  events: StageEvent[];
  currentStage: string;
}

export function LiveProgress({ events, currentStage }: Props) {
  const completedStages = new Set<string>();
  let sourcesFound = 0;
  let claimsExtracted = 0;

  for (const e of events) {
    if (e.type === 'stage-enter' && e.stage) {
      const idx = STAGE_ORDER.indexOf(e.stage);
      for (let i = 0; i < idx; i++) completedStages.add(STAGE_ORDER[i]);
    }
    if (e.type === 'source-found') sourcesFound++;
    if (e.type === 'claim-extracted') claimsExtracted++;
  }

  return (
    <div className="w-full max-w-3xl mx-auto mt-8">
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Research Progress</h3>

        <div className="space-y-2">
          {STAGE_ORDER.map(stage => {
            const isCompleted = completedStages.has(stage);
            const isCurrent = currentStage === stage;

            return (
              <div key={stage} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isCompleted ? 'bg-green-500 text-white' :
                  isCurrent ? 'bg-blue-500 text-white animate-pulse' :
                  'bg-slate-600 text-slate-400'
                }`}>
                  {isCompleted ? '\u2713' : isCurrent ? '\u2026' : '\u00B7'}
                </div>
                <span className={`text-sm ${
                  isCompleted ? 'text-green-400' :
                  isCurrent ? 'text-blue-400 font-medium' :
                  'text-slate-500'
                }`}>
                  {STAGE_NAMES[stage] || stage}
                </span>
                {isCurrent && (
                  <span className="text-xs text-slate-400 ml-auto">
                    {events.filter(e => e.stage === stage).pop()?.detail || ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {(sourcesFound > 0 || claimsExtracted > 0) && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-slate-700">
            <div className="text-sm text-slate-400">
              Sources: <span className="text-white font-medium">{sourcesFound}</span>
            </div>
            <div className="text-sm text-slate-400">
              Claims: <span className="text-white font-medium">{claimsExtracted}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
