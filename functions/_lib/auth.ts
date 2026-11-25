import { DEFAULT_USER_PASSWORD, type PublicEmployee, type UserRole } from '../../shared/types';
import { errorJson, type Env } from './http';

const COOKIE_NAME = 'escala_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias
const PBKDF2_ITERATIONS = 100_000;

export { DEFAULT_USER_PASSWORD };

export interface SessionPayload {
  uid: number;
  username: string;
  role: UserRole;
  exp: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = base64UrlToBytes(parts[2]);
  const expected = base64UrlToBytes(parts[3]);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return constantTimeEqual(new Uint8Array(derived), expected);
}

function getSecret(env: Env): string {
  return env.AUTH_SECRET || 'dev-fallback-secret-change-in-production-escala-loterica';
}

async function signHmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

export async function createSessionToken(payload: Omit<SessionPayload, 'exp'>, env: Env): Promise<string> {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const sig = await signHmac(encoded, getSecret(env));
  return `${encoded}.${bytesToBase64Url(sig)}`;
}

export async function verifySessionToken(token: string, env: Env): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sigB64] = parts;
  const expectedSig = await signHmac(encoded, getSecret(env));
  const actualSig = base64UrlToBytes(sigB64);
  if (!constantTimeEqual(actualSig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as SessionPayload;
    if (!parsed.uid || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildSessionCookie(token: string, request: Request): string {
  const isHttps = new URL(request.url).protocol === 'https:';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${isHttps ? '; Secure' : ''}`;
}

export function buildClearSessionCookie(request: Request): string {
  const isHttps = new URL(request.url).protocol === 'https:';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps ? '; Secure' : ''}`;
}

export function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

export async function getSessionUser(request: Request, env: Env): Promise<PublicEmployee | null> {
  const token = getCookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const session = await verifySessionToken(token, env);
  if (!session) return null;

  const row = await env.DB.prepare(
    `SELECT id, name, username, role, in_rotation, rotation_order, color, active, must_change_password
     FROM users WHERE id = ? AND active = 1`,
  )
    .bind(session.uid)
    .first<{
      id: number;
      name: string;
      username: string;
      role: UserRole;
      in_rotation: number;
      rotation_order: number;
      color: string;
      active: number;
      must_change_password: number;
    }>();

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    in_rotation: Boolean(row.in_rotation),
    rotation_order: row.rotation_order,
    color: row.color,
    active: Boolean(row.active),
    must_change_password: Boolean(row.must_change_password),
  };
}

export function passwordChangeRequiredResponse(): Response {
  return errorJson('Você precisa alterar a senha padrão (123456) antes de acessar o sistema.', 403);
}
