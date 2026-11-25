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
    action?: 'set' | 'swap';
    date?: string;
    employee_id?: number;
    status?: 'off' | 'work';
    note?: string;
    // Para troca de folga entre 2 funcionárias
    date_a?: string;
    employee_a?: number;
    date_b?: string;
    employee_b?: number;
  }>(request);

  if (!body) return errorJson('Dados inválidos.', 400);

  if (body.action === 'swap') {
    if (
      !isValidYmd(body.date_a) ||
      !isValidYmd(body.date_b) ||
      !body.employee_a ||
      !body.employee_b ||
      body.employee_a === body.employee_b
    ) {
      return errorJson('Selecione duas funcionárias e duas datas válidas para trocar.', 400);
    }

    const note = body.note?.trim() || 'Troca de folga';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO schedule_overrides (date, employee_id, status, note)
         VALUES (?, ?, 'work', ?)
         ON CONFLICT(date, employee_id) DO UPDATE SET status = 'work', note = excluded.note`,
      ).bind(body.date_a, body.employee_a, note),
      env.DB.prepare(
        `INSERT INTO schedule_overrides (date, employee_id, status, note)
         VALUES (?, ?, 'off', ?)
         ON CONFLICT(date, employee_id) DO UPDATE SET status = 'off', note = excluded.note`,
      ).bind(body.date_b, body.employee_a, note),
      env.DB.prepare(
        `INSERT INTO schedule_overrides (date, employee_id, status, note)
         VALUES (?, ?, 'work', ?)
         ON CONFLICT(date, employee_id) DO UPDATE SET status = 'work', note = excluded.note`,
      ).bind(body.date_b, body.employee_b, note),
      env.DB.prepare(
        `INSERT INTO schedule_overrides (date, employee_id, status, note)
         VALUES (?, ?, 'off', ?)
         ON CONFLICT(date, employee_id) DO UPDATE SET status = 'off', note = excluded.note`,
      ).bind(body.date_a, body.employee_b, note),
    ]);

    return json({ ok: true });
  }

  if (!isValidYmd(body.date) || !body.employee_id || (body.status !== 'off' && body.status !== 'work')) {
    return errorJson('Informe data, funcionária e status (off/work).', 400);
  }

  await env.DB.prepare(
    `INSERT INTO schedule_overrides (date, employee_id, status, note)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date, employee_id) DO UPDATE SET status = excluded.status, note = excluded.note`,
  )
    .bind(body.date, body.employee_id, body.status, body.note?.trim() || '')
    .run();

  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const employeeId = Number(url.searchParams.get('employee_id'));

  if (!isValidYmd(date)) return errorJson('Data inválida.', 400);

  if (Number.isInteger(employeeId) && employeeId > 0) {
    await env.DB.prepare('DELETE FROM schedule_overrides WHERE date = ? AND employee_id = ?')
      .bind(date, employeeId)
      .run();
  } else {
    await env.DB.prepare('DELETE FROM schedule_overrides WHERE date = ?').bind(date).run();
  }

  return json({ ok: true });
};
