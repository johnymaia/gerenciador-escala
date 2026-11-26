import { parseYmd } from '../../shared/holidays';
import type { VacationRequestItem, VacationStatus } from '../../shared/types';
import { getSessionUser, passwordChangeRequiredResponse } from '../_lib/auth';
import { ensureSeeded, getAllEmployees } from '../_lib/db';
import { errorJson, isValidYmd, json, readJsonBody, type Env } from '../_lib/http';

function countInclusiveDays(startYmd: string, endYmd: string): number {
  const a = parseYmd(startYmd).getTime();
  const b = parseYmd(endYmd).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

function formatBrDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();

  const isAdmin = user.role === 'admin';

  // Admin vê todos os registros.
  // Funcionária vê todas as férias ativas (pending/approved) da equipe (para transparência e bloqueio de conflito)
  // + o histórico próprio (rejected/cancelled).
  const baseSelect = `
    SELECT
      vr.id,
      vr.employee_id,
      emp.name AS employee_name,
      emp.color AS employee_color,
      vr.start_date,
      vr.end_date,
      vr.days_count,
      vr.reason,
      vr.status,
      vr.created_by,
      cr.name AS created_by_name,
      vr.admin_decided_by,
      adm.name AS admin_decided_by_name,
      vr.admin_decided_at,
      vr.created_at
    FROM vacation_requests vr
    JOIN users emp ON emp.id = vr.employee_id
    JOIN users cr ON cr.id = vr.created_by
    LEFT JOIN users adm ON adm.id = vr.admin_decided_by
  `;

  const stmt = isAdmin
    ? env.DB.prepare(
        `${baseSelect}
         ORDER BY CASE WHEN vr.status = 'pending' THEN 0 WHEN vr.status = 'approved' THEN 1 ELSE 2 END,
                  vr.start_date ASC, vr.id DESC`,
      )
    : env.DB.prepare(
        `${baseSelect}
         WHERE vr.status IN ('pending', 'approved') OR vr.employee_id = ?
         ORDER BY CASE WHEN vr.status = 'pending' THEN 0 WHEN vr.status = 'approved' THEN 1 ELSE 2 END,
                  vr.start_date ASC, vr.id DESC`,
      ).bind(user.id);

  const [{ results }, employees] = await Promise.all([
    stmt.all<VacationRequestItem>(),
    getAllEmployees(env, false),
  ]);

  const requests = results ?? [];
  const pendingAdminCount = isAdmin
    ? requests.filter((r) => r.status === 'pending').length
    : 0;

  return json({
    requests,
    employees,
    pending_admin_count: pendingAdminCount,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();

  const isAdmin = user.role === 'admin';

  const body = await readJsonBody<{
    employee_id?: number;
    start_date?: string;
    end_date?: string;
    reason?: string;
  }>(request);

  if (!body || !isValidYmd(body.start_date) || !isValidYmd(body.end_date)) {
    return errorJson('Informe a data de início e a data de término das férias.', 400);
  }

  if (body.start_date > body.end_date) {
    return errorJson('A data de término não pode ser anterior à data de início.', 400);
  }

  // Funcionário agenda apenas para si mesmo; Admin pode escolher qualquer colaborador ativo
  const targetEmployeeId =
    isAdmin && Number.isInteger(body.employee_id) && (body.employee_id ?? 0) > 0
      ? Number(body.employee_id)
      : user.id;

  const employees = await getAllEmployees(env, false);
  const targetEmployee = employees.find((e) => e.id === targetEmployeeId);
  if (!targetEmployee) {
    return errorJson('Colaborador selecionado não encontrado ou inativo.', 400);
  }

  // Verifica conflito de datas com qualquer férias pendente ou aprovada
  const conflict = await env.DB.prepare(
    `SELECT
       vr.id,
       vr.employee_id,
       emp.name AS employee_name,
       vr.start_date,
       vr.end_date,
       vr.status
     FROM vacation_requests vr
     JOIN users emp ON emp.id = vr.employee_id
     WHERE vr.status IN ('pending', 'approved')
       AND vr.start_date <= ?
       AND vr.end_date >= ?
     ORDER BY vr.start_date ASC
     LIMIT 1`,
  )
    .bind(body.end_date, body.start_date)
    .first<{
      id: number;
      employee_id: number;
      employee_name: string;
      start_date: string;
      end_date: string;
      status: VacationStatus;
    }>();

  if (conflict) {
    const statusLabel =
      conflict.status === 'approved' ? 'aprovadas' : 'aguardando aprovação';
    return errorJson(
      `Período indisponível: conflita com as férias (${statusLabel}) de ${conflict.employee_name} de ${formatBrDate(conflict.start_date)} até ${formatBrDate(conflict.end_date)}.`,
      409,
    );
  }

  const daysCount = countInclusiveDays(body.start_date, body.end_date);
  const nowIso = new Date().toISOString();

  // Se agendado por um administrador, já entra como aprovado sem precisar de mais ninguém
  const initialStatus: VacationStatus = isAdmin ? 'approved' : 'pending';
  const adminDecidedBy = isAdmin ? user.id : null;
  const adminDecidedAt = isAdmin ? nowIso : null;

  const res = await env.DB.prepare(
    `INSERT INTO vacation_requests
       (employee_id, start_date, end_date, days_count, reason, status, created_by, admin_decided_by, admin_decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      targetEmployee.id,
      body.start_date,
      body.end_date,
      daysCount,
      body.reason?.trim() || '',
      initialStatus,
      user.id,
      adminDecidedBy,
      adminDecidedAt,
    )
    .run();

  return json(
    {
      ok: true,
      id: res.meta.last_row_id,
      status: initialStatus,
      days_count: daysCount,
    },
    201,
  );
};
