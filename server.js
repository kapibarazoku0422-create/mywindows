'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const AGENT_SECRET = process.env.AGENT_SECRET;
const DEVICE_ID = process.env.DEVICE_ID || 'home-pc';
const isProduction = process.env.NODE_ENV === 'production';

if (!APP_PASSWORD || APP_PASSWORD.length < 12) throw new Error('APP_PASSWORD must be at least 12 characters');
if (!SESSION_SECRET || SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
if (!AGENT_SECRET || AGENT_SECRET.length < 32) throw new Error('AGENT_SECRET must be at least 32 characters');

const passwordKey = crypto.scryptSync(APP_PASSWORD, 'my-remote-pc-v1', 32);
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};
const validPassword = value => safeEqual(crypto.scryptSync(String(value || ''), 'my-remote-pc-v1', 32), passwordKey);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'", 'wss:', 'ws:'],
  mediaSrc: ["'self'", 'blob:'], objectSrc: ["'none'"], frameAncestors: ["'none'"]
} } }));
app.use(express.json({ limit: '8kb' }));
app.use('/api/login', rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false }));

function session(req) {
  try {
    const token = cookie.parse(req.headers.cookie || '').session;
    return jwt.verify(token, SESSION_SECRET, { algorithms: ['HS256'], issuer: 'my-remote-pc' });
  } catch { return null; }
}
function requireSession(req, res, next) {
  if (!session(req)) return res.status(401).json({ error: 'ログインが必要です' });
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/api/login', (req, res) => {
  if (!validPassword(req.body?.password)) return res.status(401).json({ error: 'パスワードが違います' });
  const token = jwt.sign({ role: 'viewer' }, SESSION_SECRET, { algorithm: 'HS256', issuer: 'my-remote-pc', expiresIn: '8h' });
  res.setHeader('Set-Cookie', cookie.serialize('session', token, { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 28_800, path: '/' }));
  res.json({ ok: true });
});
app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', cookie.serialize('session', '', { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 0, path: '/' }));
  res.json({ ok: true });
});
app.get('/api/status', requireSession, (_req, res) => res.json({ deviceId: DEVICE_ID, online: Boolean(agent?.readyState === WebSocket.OPEN) }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: res => res.setHeader('Cache-Control', 'no-store, max-age=0')
}));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
let agent = null;
const viewers = new Set();

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

function send(ws, data) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function broadcastStatus() { for (const ws of viewers) send(ws, { type: 'status', online: Boolean(agent?.readyState === WebSocket.OPEN), deviceId: DEVICE_ID }); }

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const user = session(req);
  if (user?.role === 'viewer') {
    ws.role = 'viewer'; viewers.add(ws); send(ws, { type: 'status', online: Boolean(agent?.readyState === WebSocket.OPEN), deviceId: DEVICE_ID });
  } else {
    ws.role = 'pending';
    const timer = setTimeout(() => ws.close(4401, 'authentication timeout'), 5000);
    ws.once('message', raw => {
      clearTimeout(timer);
      try {
        const msg = JSON.parse(raw);
        if (msg.type !== 'agent-auth' || !safeEqual(msg.secret, AGENT_SECRET) || msg.deviceId !== DEVICE_ID) return ws.close(4403, 'forbidden');
        if (agent) agent.close(4409, 'replaced');
        ws.role = 'agent'; agent = ws; send(ws, { type: 'agent-auth-ok' }); broadcastStatus();
      } catch { ws.close(4400, 'bad request'); }
    });
  }

  ws.on('message', raw => {
    if (ws.role === 'pending') return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!['offer', 'answer', 'ice', 'disconnect'].includes(msg.type)) return;
    if (ws.role === 'viewer') send(agent, { ...msg, peerId: 'viewer' });
    if (ws.role === 'agent') for (const viewer of viewers) send(viewer, msg);
  });
  ws.on('close', () => {
    viewers.delete(ws);
    if (agent === ws) { agent = null; broadcastStatus(); }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30_000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`my-remote-pc listening on ${PORT}`));
