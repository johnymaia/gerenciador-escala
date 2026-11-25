import type { UserRole } from '../../../../shared/types';
import {
  DEFAULT_USER_PASSWORD,
  getSessionUser,
  hashPassword,
  passwordChangeRequiredResponse,
} from '../../../_lib/auth';
import { ensureSeeded } from '../../../_lib/db';
import {
  errorJson,
  json,
  normalizeUsername,
  readJsonBody,
  type Env,
} from '../../../_lib/http';

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return errorJson('ID inválido.', 400);

  const existing = await env.DB.prepare(
    'SELECT id, name, username, role, in_rotation, rotation_order, color, active, must_change_password FROM users WHERE id = ?',
  )
    .bind(id)
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

  if (!existing) return errorJson('Funcionário não encontrado.', 404);

  const body = await readJsonBody<{
    name?: string;
    username?: string;
    reset_password?: boolean;
    role?: UserRole;
    in_rotation?: boolean;
    rotation_order?: number;
    color?: string;
    active?: boolean;
  }>(request);

  if (!body) return errorJson('Dados inválidos.', 400);

  if (id === user.id && body.active === false) {
    return errorJson('Você não pode desativar sua própria conta.', 400);
  }
  if (id === user.id && body.role && body.role !== 'admin') {
    return errorJson('Você não pode remover seu próprio perfil de administrador.', 400);
  }

  const nextName = body.name?.trim() || existing.name;
  let nextUsername = existing.username;
  if (body.username !== undefined) {
    nextUsername = normalizeUsername(body.username);
    if (nextUsername.length < 2) return errorJson('Usuário inválido.', 400);
    if (nextUsername !== existing.username) {
      const dup = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .bind(nextUsername, id)
        .first();
      if (dup) return errorJson('Este usuário já está em uso.', 409);
    }
  }

  const nextRole: UserRole = body.role === 'admin' || body.role === 'employee' ? body.role : existing.role;
  const nextInRotation = body.in_rotation !== undefined ? (body.in_rotation ? 1 : 0) : existing.in_rotation;
  const nextOrder = body.rotation_order !== undefined ? Number(body.rotation_order) : existing.rotation_order;
  const nextColor = body.color || existing.color;
  const nextActive = body.active !== undefined ? (body.active ? 1 : 0) : existing.active;

  // Admin só pode resetar a senha para a padrão (123456), nunca definir/ver senha personalizada
  if (body.reset_password === true) {
    const defaultHash = await hashPassword(DEFAULT_USER_PASSWORD);
    await env.DB.prepare(
      `UPDATE users
       SET name = ?, username = ?, password_hash = ?, must_change_password = 1, role = ?, in_rotation = ?, rotation_order = ?, color = ?, active = ?
       WHERE id = ?`,
    )
      .bind(nextName, nextUsername, defaultHash, nextRole, nextInRotation, nextOrder, nextColor, nextActive, id)
      .run();

    return json({
      id,
      name: nextName,
      username: nextUsername,
      role: nextRole,
      in_rotation: Boolean(nextInRotation),
      rotation_order: nextOrder,
      color: nextColor,
      active: Boolean(nextActive),
      must_change_password: true,
    });
  }

  await env.DB.prepare(
    `UPDATE users
     SET name = ?, username = ?, role = ?, in_rotation = ?, rotation_order = ?, color = ?, active = ?
     WHERE id = ?`,
  )
    .bind(nextName, nextUsername, nextRole, nextInRotation, nextOrder, nextColor, nextActive, id)
    .run();

  return json({
    id,
    name: nextName,
    username: nextUsername,
    role: nextRole,
    in_rotation: Boolean(nextInRotation),
    rotation_order: nextOrder,
    color: nextColor,
    active: Boolean(nextActive),
    must_change_password: Boolean(existing.must_change_password),
  });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return errorJson('ID inválido.', 400);
  if (id === user.id) return errorJson('Você não pode excluir a própria conta.', 400);

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return json({ ok: true });
};
