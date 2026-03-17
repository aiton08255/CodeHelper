const API_BASE = '/api';

let authToken = localStorage.getItem('self-evo-token') || '';

export function setToken(token: string) {
  authToken = token;
  localStorage.setItem('self-evo-token', token);
}

export function getToken() {
  return authToken;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API Error: ${res.status}`);
  }
  return res.json();
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function startResearch(query: string, depth: string) {
  return apiFetch('/research', {
    method: 'POST',
    body: JSON.stringify({ query, depth }),
  });
}

export async function getResearch(id: number) {
  return apiFetch(`/research/${id}`);
}

export async function getHistory(limit = 20, offset = 0) {
  return apiFetch(`/research/history?limit=${limit}&offset=${offset}`);
}

export async function getClaims(params: { tag?: string; q?: string; limit?: number } = {}) {
  if (params.q) return apiFetch(`/claims/search?q=${encodeURIComponent(params.q)}`);
  const query = new URLSearchParams();
  if (params.tag) query.set('tag', params.tag);
  if (params.limit) query.set('limit', String(params.limit));
  return apiFetch(`/claims?${query}`);
}

export async function getQuotas() {
  return apiFetch('/quotas');
}

export async function getEvolutionLog(limit = 50) {
  return apiFetch(`/evolution/changelog?limit=${limit}`);
}

export function connectWebSocket(onMessage: (msg: any) => void): WebSocket | null {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token: authToken }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      // Auto-reconnect after 3s
      setTimeout(() => connectWebSocket(onMessage), 3000);
    };

    return ws;
  } catch {
    return null;
  }
}
