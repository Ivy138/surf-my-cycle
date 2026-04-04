const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET || 'smc-dev-secret';
const crypto = require('crypto');

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

function ensureEnv(name, value) {
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function supabaseFetch(path, options = {}, useServiceRole = false, accessToken = '') {
  ensureEnv('SUPABASE_URL', SUPABASE_URL);
  const key = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  ensureEnv(useServiceRole ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY', key);
  const response = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + (accessToken || key),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return response;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signSession(payload) {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  if (signature !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

function getStableUserId(user = {}) {
  return String(user.username || user.id || '').trim().toLowerCase();
}

function createSession(user) {
  const expiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const stableUserId = getStableUserId(user);
  const payload = {
    id: stableUserId,
    username: stableUserId,
    exp: expiresAtMs
  };
  return {
    access_token: signSession(payload),
    refresh_token: '',
    expires_at: Math.floor(expiresAtMs / 1000),
    user: {
      id: stableUserId,
      username: stableUserId,
      email: `${stableUserId}@local`
    }
  };
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

async function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const hashed = await hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hashed), Buffer.from(`${salt}:${expected}`));
}

async function getRegistryUser(username) {
  const params = new URLSearchParams({
    select: '*',
    user_id: 'eq.auth_registry',
    key: `eq.user:${String(username || '').trim().toLowerCase()}`
  });
  const response = await supabaseFetch(`/rest/v1/memory?${params.toString()}`);
  if (!response.ok) return null;
  const rows = await response.json();
  if (!rows[0]) return null;
  return JSON.parse(rows[0].value || '{}');
}

async function saveRegistryUser(user) {
  const response = await supabaseFetch('/rest/v1/memory', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: 'auth_registry',
      key: `user:${user.username}`,
      value: JSON.stringify(user)
    })
  });
  return response.ok;
}

function newUserId() {
  return crypto.randomUUID();
}

async function getUserFromRequest(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const user = verifySessionToken(token);
  if (!user) return null;
  return {
    id: user.id,
    email: `${user.username}@local`,
    username: user.username,
    accessToken: token
  };
}

function allowCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  allowCors,
  getUserFromRequest,
  getRegistryUser,
  json,
  createSession,
  getStableUserId,
  hashPassword,
  newUserId,
  readJsonBody,
  saveRegistryUser,
  supabaseFetch,
  verifyPassword
};
