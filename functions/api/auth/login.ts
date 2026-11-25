import {
  buildSessionCookie,
  createSessionToken,
  DEFAULT_USER_PASSWORD,
  verifyPassword,
} from '../../_lib/auth';
import { ensureSeeded, getSettings } from '../../_lib/db';
import {
  errorJson,
  json,
  normalizeUsername,
  readJsonBody,
  type Env,
} from '../../_lib/http';
import type { UserRole } from '../../../shared/types';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);

  const body = await readJsonBody<{ username?: string; password?: string }>(request);
  if (!body || !body.username || !body.password) {
    return errorJson('Informe usuário e senha.', 400);
  }

  const username = normalizeUsername(body.username);
  if (!username) {
    return errorJson('Usuário inválido.', 400);
  }

  const row = await env.DB.prepare(
    `SELECT id, name, username, password_hash, role, in_rotation, rotation_order, color, active, must_change_password
     FROM users WHERE username = ?`,
  )
    .bind(username)
    .first<{
      id: number;
      name: string;
      username: string;
      password_hash: string;
      role: UserRole;
      in_rotation: number;
      rotation_order: number;
      color: string;
      active: number;
      must_change_password: number;
    }>();

  if (!row || !row.active) {
    return errorJson('Usuário ou senha incorretos.', 401);
  }

  const valid = await verifyPassword(body.password, row.password_hash);
  if (!valid) {
    return errorJson('Usuário ou senha incorretos.', 401);
  }

  // Se a senha for a padrão (123456), obriga alteração no primeiro login
  const mustChangePassword = Boolean(row.must_change_password) || body.password === DEFAULT_USER_PASSWORD;
  if (mustChangePassword && !row.must_change_password) {
    await env.DB.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?')
      .bind(row.id)
      .run();
  }

  const token = await createSessionToken(
    { uid: row.id, username: row.username, role: row.role },
    env,
  );
  const settings = await getSettings(env);

  return json(
    {
      user: {
        id: row.id,
        name: row.name,
        username: row.username,
        role: row.role,
        in_rotation: Boolean(row.in_rotation),
        rotation_order: row.rotation_order,
        color: row.color,
        active: Boolean(row.active),
        must_change_password: mustChangePassword,
      },
      settings,
    },
    200,
    { 'Set-Cookie': buildSessionCookie(token, request) },
  );
};
