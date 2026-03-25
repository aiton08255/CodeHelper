import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import type { Server } from 'http';

const authenticatedClients = new Set<WebSocket>();

export function setupWebSocket(server: Server, token: string): void {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let authenticated = false;

    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'Auth timeout');
      }
    }, 5000);

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!authenticated && msg.type === 'auth' && msg.token === token) {
          authenticated = true;
          clearTimeout(authTimeout);
          authenticatedClients.add(ws);
          ws.send(JSON.stringify({ type: 'auth-ok' }));
        }
      } catch {}
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      authenticatedClients.delete(ws);
    });
  });
}

export function broadcast(msg: any): void {
  const data = JSON.stringify(msg);
  for (const client of authenticatedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function createEmitter(): (msg: any) => void {
  return (msg: any) => broadcast(msg);
}
