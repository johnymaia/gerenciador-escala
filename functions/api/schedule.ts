import {
  computeScheduleRange,
  getMondayOfWeek,
  getSundayOfWeek,
  getTodayBrazilYmd,
} from '../../shared/schedule';
import type { DaySwapSummary, DayVacationSummary } from '../../shared/types';
import { getSessionUser, passwordChangeRequiredResponse } from '../_lib/auth';
import {
  ensureSeeded,
  getAllEmployees,
  getApprovedVacationsInRange,
  getHolidayOverrides,
  getScheduleOverrides,
  getSettings,
} from '../_lib/db';
import { errorJson, isValidYmd, json, type Env } from '../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();

  const url = new URL(request.url);
  const today = getTodayBrazilYmd();
  const from = url.searchParams.get('from') || getMondayOfWeek(today);
  const to = url.searchParams.get('to') || getSundayOfWeek(today);

  if (!isValidYmd(from) || !isValidYmd(to) || from > to) {
    return errorJson('Período inválido.', 400);
  }

  const [
    settings,
    employees,
    holidayOverrides,
    scheduleOverrides,
    approvedSwapsRes,
    activeVacationsRes,
    approvedVacationsForCascade,
  ] = await Promise.all([
    getSettings(env),
    getAllEmployees(env, false),
    getHolidayOverrides(env),
    getScheduleOverrides(env, from, to),
    env.DB.prepare(
      `SELECT
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
         sr.is_open_swap,
         adm.name AS approved_by_name
       FROM swap_requests sr
       JOIN users req ON req.id = sr.requester_id
       LEFT JOIN users tgt ON tgt.id = sr.target_id
       LEFT JOIN users adm ON adm.id = sr.admin_decided_by
       WHERE sr.status = 'approved'
         AND (
           (sr.requester_date >= ? AND sr.requester_date <= ?)
           OR (sr.target_date >= ? AND sr.target_date <= ?)
         )
       ORDER BY sr.id DESC`,
    )
      .bind(from, to, from, to)
      .all<Omit<DaySwapSummary, 'is_open_swap'> & { is_open_swap: number }>(),
    env.DB.prepare(
      `SELECT
         vr.id,
         vr.employee_id,
         emp.name AS employee_name,
         emp.color AS employee_color,
         vr.start_date,
         vr.end_date,
         vr.days_count,
         vr.reason,
         vr.status,
         adm.name AS approved_by_name
       FROM vacation_requests vr
       JOIN users emp ON emp.id = vr.employee_id
       LEFT JOIN users adm ON adm.id = vr.admin_decided_by
       WHERE vr.status IN ('pending', 'approved')
         AND vr.start_date <= ?
         AND vr.end_date >= ?
       ORDER BY vr.start_date ASC, vr.id ASC`,
    )
      .bind(to, from)
      .all<DayVacationSummary>(),
    getApprovedVacationsInRange(env, from, to),
  ]);

  const days = computeScheduleRange({
    from,
    to,
    employees,
    settings,
    holidayOverrides,
    scheduleOverrides,
    approvedVacations: approvedVacationsForCascade,
  });

  // Associa cada troca aprovada aos dois dias envolvidos no calendário
  const swapsByDate = new Map<string, DaySwapSummary[]>();
  for (const rawSw of approvedSwapsRes.results ?? []) {
    const sw: DaySwapSummary = {
      ...rawSw,
      is_open_swap: Boolean(rawSw.is_open_swap),
      target_name: rawSw.is_open_swap ? 'Folga Livre' : rawSw.target_name,
      target_color: rawSw.is_open_swap ? '#0F766E' : rawSw.target_color,
    };
    const listA = swapsByDate.get(sw.requester_date) ?? [];
    listA.push(sw);
    swapsByDate.set(sw.requester_date, listA);

    if (sw.target_date !== sw.requester_date) {
      const listB = swapsByDate.get(sw.target_date) ?? [];
      listB.push(sw);
      swapsByDate.set(sw.target_date, listB);
    }
  }

  const activeVacations = activeVacationsRes.results ?? [];

  for (const day of days) {
    const daySwaps = swapsByDate.get(day.date) ?? [];
    day.swaps = daySwaps;
    day.vacations = activeVacations.filter(
      (v) => v.start_date <= day.date && v.end_date >= day.date,
    );
    day.has_manual_change = day.has_manual_change || daySwaps.length > 0;
  }

  const rotationEmployees = employees
    .filter((e) => e.in_rotation)
    .sort((a, b) => a.rotation_order - b.rotation_order || a.id - b.id);

  return json({
    today,
    from,
    to,
    settings,
    employees: rotationEmployees,
    days,
  });
};
