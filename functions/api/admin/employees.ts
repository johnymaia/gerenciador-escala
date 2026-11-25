import type { UserRole } from '../../../shared/types';
import {
  DEFAULT_USER_PASSWORD,
  getSessionUser,
  hashPassword,
  passwordChangeRequiredResponse,
} from '../../_lib/auth';
import { ensureSeeded, getAllEmployees } from '../../_lib/db';
import {
  errorJson,
  json,
  normalizeUsername,
  readJsonBody,
  type Env,
} from '../../_lib/http';

const PALETTE = ['#0F766E', '#0284C7', '#7C3AED', '#DB2777', '#D97706', '#059669', '#2563EB', '#E11D48'];

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const employees = await getAllEmployees(env, true);
  return json({ employees });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const body = await readJsonBody<{
    name?: string;
    username?: string;
    role?: UserRole;
    in_rotation?: boolean;
    rotation_order?: number;
    color?: string;
  }>(request);

  if (!body?.name?.trim() || !body?.username?.trim()) {
    return errorJson('Preencha nome e usuário.', 400);
  }

  const username = normalizeUsername(body.username);
  if (username.length < 2) {
    return errorJson('Usuário deve ter pelo menos 2 letras/números.', 400);
  }

  const role: UserRole = body.role === 'admin' ? 'admin' : 'employee';
  const inRotation = body.in_rotation !== undefined ? Boolean(body.in_rotation) : role === 'employee';

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
    .bind(username)
    .first();
  if (existing) {
    return errorJson('Este nome de usuário já está em uso.', 409);
  }

  const maxOrderRow = await env.DB.prepare('SELECT MAX(rotation_order) as max_ord FROM users WHERE in_rotation = 1')
    .first<{ max_ord: number | null }>();
  const nextOrder = body.rotation_order ?? (inRotation ? (maxOrderRow?.max_ord ?? 0) + 1 : 0);

  const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM users').first<{ total: number }>();
  const color = body.color || PALETTE[(countRow?.total ?? 0) % PALETTE.length];

  // Todo novo usuário recebe obrigatoriamente a senha padrão (123456) e troca no 1º acesso
  const passwordHash = await hashPassword(DEFAULT_USER_PASSWORD);

  const result = await env.DB.prepare(
    `INSERT INTO users (name, username, password_hash, role, in_rotation, rotation_order, color, active, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
  )
    .bind(body.name.trim(), username, passwordHash, role, inRotation ? 1 : 0, nextOrder, color)
    .run();

  return json(
    {
      id: result.meta.last_row_id,
      name: body.name.trim(),
      username,
      role,
      in_rotation: inRotation,
      rotation_order: nextOrder,
      color,
      active: true,
      must_change_password: true,
    },
    201,
  );
};
