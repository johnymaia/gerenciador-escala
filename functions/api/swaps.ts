import { computeScheduleRange, getTodayBrazilYmd } from '../../shared/schedule';
import type { ApprovalState, SwapOverallStatus, SwapRequestItem } from '../../shared/types';
import { getSessionUser, passwordChangeRequiredResponse } from '../_lib/auth';
import {
  ensureSeeded,
  getAllEmployees,
  getHolidayOverrides,
  getScheduleOverrides,
  getSettings,
} from '../_lib/db';
import { errorJson, isValidYmd, json, readJsonBody, type Env } from '../_lib/http';

interface SwapRow {
  id: number;
  requester_id: number;
  requester_name: string;
  requester_color: string;
  requester_date: string;
  target_id: number;
  target_name: string;
  target_color: string;
  target_date: string;
  reason: string;
  target_status: ApprovalState;
  target_decided_at: string | null;
  admin_status: ApprovalState;
  admin_decided_by: number | null;
  admin_decided_by_name: string | null;
  admin_decided_at: string | null;
  status: SwapOverallStatus;
  created_at: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();

  const isAdmin = user.role === 'admin';

  const baseSelect = `
    SELECT
      sr.id,
      sr.requester_id,
      req.name AS requester_name,
      req.color AS requester_color,
      sr.requester_date,
      sr.target_id,
      tgt.name AS target_name,
      tgt.color AS target_color,
      sr.target_date,
      sr.reason,
      sr.target_status,
      sr.target_decided_at,
      sr.admin_status,
      sr.admin_decided_by,
      adm.name AS admin_decided_by_name,
      sr.admin_decided_at,
      sr.status,
      sr.created_at
    FROM swap_requests sr
    JOIN users req ON req.id = sr.requester_id
    JOIN users tgt ON tgt.id = sr.target_id
    LEFT JOIN users adm ON adm.id = sr.admin_decided_by
  `;

  const stmt = isAdmin
    ? env.DB.prepare(`${baseSelect} ORDER BY CASE WHEN sr.status = 'pending' THEN 0 ELSE 1 END, sr.created_at DESC`)
    : env.DB.prepare(
        `${baseSelect}
         WHERE sr.requester_id = ? OR sr.target_id = ?
         ORDER BY CASE WHEN sr.status = 'pending' THEN 0 ELSE 1 END, sr.created_at DESC`,
      ).bind(user.id, user.id);

  const { results } = await stmt.all<SwapRow>();
  const requests: SwapRequestItem[] = results ?? [];

  const pendingActionCount = requests.filter((r) => {
    if (r.status !== 'pending') return false;
    const needsMyTargetApproval = r.target_id === user.id && r.target_status === 'pending';
    const needsMyAdminApproval = isAdmin && r.admin_status === 'pending';
    return needsMyTargetApproval || needsMyAdminApproval;
  }).length;

  return json({
    requests,
    pending_action_count: pendingActionCount,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();

  if (!user.in_rotation) {
    return errorJson('Apenas colaboradores participantes do rodízio podem solicitar troca de folga.', 400);
  }

  const body = await readJsonBody<{
    requester_date?: string;
    target_id?: number;
    target_date?: string;
    reason?: string;
  }>(request);

  if (
    !body ||
    !isValidYmd(body.requester_date) ||
    !isValidYmd(body.target_date) ||
    !Number.isInteger(body.target_id)
  ) {
    return errorJson('Selecione sua data de folga, a colega e a data de folga dela.', 400);
  }

  if (body.target_id === user.id) {
    return errorJson('Selecione outra colega para trocar a folga.', 400);
  }

  if (body.requester_date === body.target_date) {
    return errorJson('As datas escolhidas precisam ser diferentes.', 400);
  }

  const today = getTodayBrazilYmd();
  if (body.requester_date < today || body.target_date < today) {
    return errorJson('Só é possível solicitar troca para datas a partir de hoje.', 400);
  }

  const from = body.requester_date < body.target_date ? body.requester_date : body.target_date;
  const to = body.requester_date > body.target_date ? body.requester_date : body.target_date;

  const [settings, employees, holidayOverrides, scheduleOverrides] = await Promise.all([
    getSettings(env),
    getAllEmployees(env, false),
    getHolidayOverrides(env),
    getScheduleOverrides(env, from, to),
  ]);

  const targetEmp = employees.find((e) => e.id === body.target_id && e.in_rotation);
  if (!targetEmp) {
    return errorJson('Colega selecionada não participa do rodízio.', 400);
  }

  const days = computeScheduleRange({
    from,
    to,
    employees,
    settings,
    holidayOverrides,
    scheduleOverrides,
  });

  const reqDay = days.find((d) => d.date === body.requester_date);
  const tgtDay = days.find((d) => d.date === body.target_date);

  if (!reqDay || !reqDay.off_employee_ids.includes(user.id)) {
    return errorJson('A data escolhida não é o seu dia de folga atual.', 400);
  }
  if (!tgtDay || !tgtDay.off_employee_ids.includes(targetEmp.id)) {
    return errorJson(`A data escolhida não é o dia de folga atual de ${targetEmp.name}.`, 400);
  }

  // Evita duplicidade de pedido pendente idêntico
  const dup = await env.DB.prepare(
    `SELECT id FROM swap_requests
     WHERE status = 'pending'
       AND requester_id = ? AND requester_date = ?
       AND target_id = ? AND target_date = ?`,
  )
    .bind(user.id, body.requester_date, targetEmp.id, body.target_date)
    .first();

  if (dup) {
    return errorJson('Já existe uma solicitação pendente igual a essa.', 409);
  }

  const res = await env.DB.prepare(
    `INSERT INTO swap_requests (requester_id, requester_date, target_id, target_date, reason)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(user.id, body.requester_date, targetEmp.id, body.target_date, body.reason?.trim() || '')
    .run();

  return json({ ok: true, id: res.meta.last_row_id }, 201);
};
