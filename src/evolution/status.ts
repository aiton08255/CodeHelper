/**
 * Global status tracker — broadcasts what Self-Evo is doing right now.
 * The dashboard polls this to show live activity state.
 */

interface StatusEntry {
  state: 'idle' | 'learning' | 'brain' | 'searching' | 'discovering' | 'consolidating' | 'fusing' | 'absorbing' | 'waiting';
  detail: string;
  started_at: number;
  wait_until?: number; // for 'waiting' state — when it resumes
}

let currentStatus: StatusEntry = {
  state: 'idle',
  detail: 'Ready',
  started_at: Date.now(),
};

const recentActivity: { state: string; detail: string; timestamp: number; duration_ms: number }[] = [];

export function setStatus(state: StatusEntry['state'], detail: string, waitUntil?: number): void {
  // Log previous activity
  if (currentStatus.state !== 'idle' && currentStatus.state !== 'waiting') {
    recentActivity.unshift({
      state: currentStatus.state,
      detail: currentStatus.detail,
      timestamp: currentStatus.started_at,
      duration_ms: Date.now() - currentStatus.started_at,
    });
    if (recentActivity.length > 20) recentActivity.pop();
  }

  currentStatus = {
    state,
    detail,
    started_at: Date.now(),
    wait_until: waitUntil,
  };
}

export function getStatus(): {
  current: {
    state: string;
    detail: string;
    elapsed_s: number;
    wait_remaining_s?: number;
  };
  recent: { state: string; detail: string; timestamp: number; duration_ms: number }[];
} {
  const now = Date.now();
  const elapsed = Math.floor((now - currentStatus.started_at) / 1000);
  const waitRemaining = currentStatus.wait_until
    ? Math.max(0, Math.floor((currentStatus.wait_until - now) / 1000))
    : undefined;

  return {
    current: {
      state: currentStatus.state,
      detail: currentStatus.detail,
      elapsed_s: elapsed,
      wait_remaining_s: waitRemaining,
    },
    recent: recentActivity.slice(0, 10),
  };
}
