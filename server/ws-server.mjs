// Drive Jamaica — WebSocket position-sync server
// See server/fly.toml for Fly.io deployment.
// Run locally: node ws-server.mjs (after npm install in this directory)

import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const PORT = parseInt(process.env.WS_PORT ?? '8080', 10);
const MAX_CLIENTS = 100;

function sanitize(str) {
  if (typeof str !== 'string') return 'Anonymous';
  return str.replace(/<[^>]*>/g, '').slice(0, 20).trim() || 'Anonymous';
}

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// id → { ws, x, y, z, heading, nickname }
const peers = new Map();
let nextId = 1;

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
  if (peers.size >= MAX_CLIENTS) {
    ws.close(1013, 'Server full');
    return;
  }

  const id = String(nextId++);
  const peer = { ws, x: 0, y: 0, z: 0, heading: 0, nickname: 'Anonymous' };
  peers.set(id, peer);

  ws.send(JSON.stringify({ type: 'hello', id }));
  broadcast(null, { type: 'peers', peers: peerList() });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'pos') {
      if (
        !isFiniteNum(msg.x) || !isFiniteNum(msg.y) ||
        !isFiniteNum(msg.z) || !isFiniteNum(msg.heading)
      ) return;
      peer.x = msg.x;
      peer.y = msg.y;
      peer.z = msg.z;
      peer.heading = msg.heading;
      peer.nickname = sanitize(msg.nickname);
      broadcast(null, { type: 'peers', peers: peerList() });
    } else if (msg.type === 'emote') {
      if (typeof msg.kind !== 'string') return;
      broadcast(id, { type: 'emote', from: id, kind: msg.kind.slice(0, 16) });
    }
  });

  ws.on('close', () => {
    peers.delete(id);
    broadcast(null, { type: 'peers', peers: peerList() });
  });

  ws.on('error', () => {
    peers.delete(id);
  });
});

function peerList() {
  return Array.from(peers.entries()).map(([id, p]) => ({
    id,
    x: p.x,
    y: p.y,
    z: p.z,
    heading: p.heading,
    nickname: p.nickname,
  }));
}

// broadcast to all peers, optionally excluding one (by id string)
function broadcast(exceptId, msg) {
  const payload = JSON.stringify(msg);
  for (const [id, { ws }] of peers.entries()) {
    if (id !== exceptId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

http.listen(PORT, '0.0.0.0', () => {
  console.log(`Drive Jamaica WS server listening on :${PORT}`);
  console.log(`  Health check: http://0.0.0.0:${PORT}/health`);
});

// Graceful shutdown — clears machine health on Fly.io SIGTERM
process.on('SIGTERM', () => {
  wss.close(() => {
    http.close(() => process.exit(0));
  });
});
