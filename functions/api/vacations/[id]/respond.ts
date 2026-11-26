import type { VacationStatus } from '../../../../shared/types';
import { getSessionUser, passwordChangeRequiredResponse } from '../../../_lib/auth';
import { ensureSeeded } from '../../../_lib/db';
import { errorJson, json, readJsonBody, type Env } from '../../../_lib/http';

function formatBrDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return errorJson('ID inválido.', 400);

  const vacation = await env.DB.prepare(
    `SELECT id, employee_id, start_date, end_date, status
     FROM vacation_requests WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: number;
      employee_id: number;
      start_date: string;
      end_date: string;
      status: VacationStatus;
    }>();

  if (!vacation) return errorJson('Registro de férias não encontrado.', 404);

  const body = await readJsonBody<{
    decision?: 'approved' | 'rejected' | 'cancelled';
  }>(request);

  if (!body?.decision || !['approved', 'rejected', 'cancelled'].includes(body.decision)) {
    return errorJson('Decisão inválida.', 400);
  }

  const isAdmin = user.role === 'admin';
  const isOwner = vacation.employee_id === user.id;

  // Cancelamento:
  // - Funcionário dono pode cancelar se ainda estiver pendente
  // - Administrador pode cancelar férias pendentes ou já aprovadas
  if (body.decision === 'cancelled') {
    if (vacation.status !== 'pending' && vacation.status !== 'approved') {
      return errorJson('Este agendamento de férias já está encerrado.', 400);
    }
    if (!isAdmin && !(isOwner && vacation.status === 'pending')) {
      return errorJson(
        'Apenas administradores podem cancelar férias já aprovadas ou de outros colaboradores.',
        403,
      );
    }

    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE vacation_requests
       SET status = 'cancelled',
           admin_decided_by = COALESCE(?, admin_decided_by),
           admin_decided_at = COALESCE(?, admin_decided_at)
       WHERE id = ?`,
    )
      .bind(isAdmin ? user.id : null, isAdmin ? nowIso : null, id)
      .run();

    return json({ ok: true, status: 'cancelled' });
  }

  // Aprovar ou Recusar: exclusivo para Administrador
  if (!isAdmin) {
    return errorJson('Apenas administradores podem aprovar ou recusar férias.', 403);
  }

  if (vacation.status !== 'pending') {
    return errorJson('Esta solicitação de férias já foi decidida.', 400);
  }

  if (body.decision === 'approved') {
    // Revalida conflito antes de aprovar
    const conflict = await env.DB.prepare(
      `SELECT vr.id, emp.name AS employee_name, vr.start_date, vr.end_date, vr.status
       FROM vacation_requests vr
       JOIN users emp ON emp.id = vr.employee_id
       WHERE vr.id != ?
         AND vr.status IN ('pending', 'approved')
         AND vr.start_date <= ?
         AND vr.end_date >= ?
       LIMIT 1`,
    )
      .bind(id, vacation.end_date, vacation.start_date)
      .first<{
        id: number;
        employee_name: string;
        start_date: string;
        end_date: string;
        status: VacationStatus;
      }>();

    if (conflict) {
      return errorJson(
        `Não é possível aprovar: há conflito com as férias de ${conflict.employee_name} (${formatBrDate(conflict.start_date)} a ${formatBrDate(conflict.end_date)}).`,
        409,
      );
    }
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE vacation_requests
     SET status = ?, admin_decided_by = ?, admin_decided_at = ?
     WHERE id = ?`,
  )
    .bind(body.decision, user.id, nowIso, id)
    .run();

  return json({
    ok: true,
    status: body.decision,
  });
};
