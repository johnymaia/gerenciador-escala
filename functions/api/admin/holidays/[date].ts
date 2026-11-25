import { getSessionUser, passwordChangeRequiredResponse } from '../../../_lib/auth';
import { ensureSeeded } from '../../../_lib/db';
import { errorJson, isValidYmd, json, type Env } from '../../../_lib/http';

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const date = String(params.date || '');
  if (!isValidYmd(date)) return errorJson('Data inválida.', 400);

  await env.DB.prepare('DELETE FROM holiday_overrides WHERE date = ?').bind(date).run();
  return json({ ok: true });
};
