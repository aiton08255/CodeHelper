import { useState, useEffect, useCallback } from 'react';
import { SearchBar } from './components/SearchBar';
import { LiveProgress } from './components/LiveProgress';
import { Report } from './components/Report';
import { startResearch, getResearch, connectWebSocket, setToken, getToken, checkHealth } from './lib/api';
import './App.css';

type View = 'search' | 'progress' | 'report';

function App() {
  const [view, setView] = useState<View>('search');
  const [events, setEvents] = useState<any[]>([]);
  const [currentStage, setCurrentStage] = useState('');
  const [report, setReport] = useState<any>(null);
  const [researchId, setResearchId] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(!getToken());

  // Check connection on mount
  useEffect(() => {
    checkHealth()
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
  }, []);

  // WebSocket for live progress
  useEffect(() => {
    if (!getToken()) return;

    const ws = connectWebSocket((msg) => {
      if (msg.type === 'auth-ok') return;

      setEvents(prev => [...prev, msg]);

      if (msg.type === 'stage-enter') {
        setCurrentStage(msg.stage);
      }

      if (msg.type === 'done') {
        // Fetch final report
        if (researchId) {
          setTimeout(() => {
            getResearch(researchId).then(data => {
              if (data.report) {
                setReport(data.report);
                setView('report');
              }
            });
          }, 1000);
        }
      }
    });

    return () => { ws?.close(); };
  }, [researchId]);

  const handleSearch = useCallback(async (query: string, depth: 'quick' | 'standard' | 'deep') => {
    setEvents([]);
    setCurrentStage('');
    setReport(null);
    setView('progress');

    try {
      const result = await startResearch(query, depth);
      setResearchId(result.research_id);

      // Poll for completion as backup (in case WebSocket misses the done event)
      const poll = setInterval(async () => {
        try {
          const data = await getResearch(result.research_id);
          if (data.status === 'completed' && data.report) {
            clearInterval(poll);
            setReport(data.report);
            setView('report');
          } else if (data.status === 'failed') {
            clearInterval(poll);
            setReport({
              query,
              depth,
              executive_summary: `Research failed: ${data.report?.error || 'Unknown error'}`,
              findings: '',
              limitations: 'The research pipeline encountered an error.',
              sources: [],
              overall_confidence: 0,
              claims: [],
            });
            setView('report');
          }
        } catch {}
      }, 3000);

      // Stop polling after 5 min
      setTimeout(() => clearInterval(poll), 300_000);
    } catch (err) {
      alert(`Error: ${(err as Error).message}`);
      setView('search');
    }
  }, []);

  const handleTokenSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const token = form.get('token') as string;
    if (token) {
      setToken(token);
      setShowTokenInput(false);
      window.location.reload();
    }
  };

  if (showTokenInput) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-2">Self-Evo</h1>
          <p className="text-slate-400 mb-6">Enter your auth token to connect. Find it in the server console output.</p>
          <form onSubmit={handleTokenSubmit}>
            <input
              name="token"
              type="password"
              placeholder="Paste your auth token..."
              className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-4"
            />
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
            >
              Connect
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      {/* Header */}
      <header className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-1">Self-Evo</h1>
        <p className="text-slate-400 text-sm">
          Deep Research Engine
          <span className={`ml-2 inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        </p>
      </header>

      {/* Search always visible */}
      <SearchBar onSearch={handleSearch} disabled={view === 'progress'} />

      {/* Live progress */}
      {view === 'progress' && (
        <LiveProgress events={events} currentStage={currentStage} />
      )}

      {/* Report */}
      {view === 'report' && report && (
        <Report report={report} onNewSearch={() => setView('search')} />
      )}

      {/* Footer */}
      <footer className="text-center mt-12 text-xs text-slate-600">
        Self-Evo v0.1 | Private Research Engine
      </footer>
    </div>
  );
}

export default App;
