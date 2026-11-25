import { getSessionUser, passwordChangeRequiredResponse } from '../../_lib/auth';
import { ensureSeeded } from '../../_lib/db';
import { errorJson, isValidYmd, json, readJsonBody, type Env } from '../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const body = await readJsonBody<{
    date?: string;
    employee_id?: number;
    hours_delta?: number;
    reason?: string;
  }>(request);

  if (
    !body ||
    !isValidYmd(body.date) ||
    !Number.isInteger(body.employee_id) ||
    typeof body.hours_delta !== 'number' ||
    Number.isNaN(body.hours_delta) ||
    body.hours_delta === 0
  ) {
    return errorJson('Informe data, funcionária e diferença de horas (ex: -8 ou +2).', 400);
  }

  const res = await env.DB.prepare(
    `INSERT INTO hour_adjustments (date, employee_id, hours_delta, reason)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(body.date, body.employee_id, body.hours_delta, body.reason?.trim() || '')
    .run();

  return json({ ok: true, id: res.meta.last_row_id }, 201);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return errorJson('ID inválido.', 400);

  await env.DB.prepare('DELETE FROM hour_adjustments WHERE id = ?').bind(id).run();
  return json({ ok: true });
};
