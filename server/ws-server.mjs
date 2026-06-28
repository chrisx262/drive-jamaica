/**
 * Drive Jamaica — ambient multiplayer WebSocket server.
 *
 * Protocol (all JSON):
 *   Client → Server:  { type: 'pos', x, y, z, heading, nickname }
 *                     { type: 'emote', kind: 'honk' | 'wave' }
 *   Server → Client:  { type: 'hello', id }
 *                     { type: 'peers', peers: PeerState[] }
 *                     { type: 'emote', from, kind }
 *
 * Deploy: fly.io / Railway. Set WS_PORT env var (default 8080).
 * Install:  cd server && npm install
 * Run:      node ws-server.mjs
 */

import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.WS_PORT ?? '8080', 10);
const MAX_CLIENTS = 100;
const NICK_MAX = 20;

const wss = new WebSocketServer({ port: PORT });

// id → { ws, state }
const clients = new Map();
let nextId = 1;

wss.on('connection', (ws) => {
  if (clients.size >= MAX_CLIENTS) {
    ws.close(1013, 'Server full');
    return;
  }

  const id = String(nextId++);
  const state = { id, nickname: 'anon', x: 0, y: 0, z: 0, heading: 0 };
  clients.set(id, { ws, state });

  ws.send(JSON.stringify({ type: 'hello', id }));
  broadcastPeers();

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (typeof msg !== 'object' || msg === null) return;

    const client = clients.get(id);
    if (!client) return;

    if (msg.type === 'pos') {
      const nick = typeof msg.nickname === 'string'
        ? msg.nickname.replace(/<[^>]*>/g, '').slice(0, NICK_MAX).trim() || 'anon'
        : 'anon';
      client.state = {
        id,
        nickname: nick,
        x: isFinite(msg.x) ? +msg.x : 0,
        y: isFinite(msg.y) ? +msg.y : 0,
        z: isFinite(msg.z) ? +msg.z : 0,
        heading: isFinite(msg.heading) ? +msg.heading : 0,
      };
      broadcastPeers();
    } else if (msg.type === 'emote') {
      const kind = msg.kind === 'honk' ? 'honk' : 'wave';
      const fwd = JSON.stringify({ type: 'emote', from: id, kind });
      for (const [cid, c] of clients) {
        if (cid !== id && c.ws.readyState === 1) c.ws.send(fwd);
      }
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    broadcastPeers();
  });

  ws.on('error', () => {
    clients.delete(id);
  });
});

function broadcastPeers() {
  const peers = Array.from(clients.values()).map((c) => c.state);
  const msg = JSON.stringify({ type: 'peers', peers });
  for (const { ws } of clients.values()) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

console.log(`Drive Jamaica WS server listening on :${PORT}`);
