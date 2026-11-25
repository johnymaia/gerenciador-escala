import {
  computeScheduleRange,
  getMondayOfWeek,
  getSundayOfWeek,
  getTodayBrazilYmd,
} from '../../shared/schedule';
import { getSessionUser, passwordChangeRequiredResponse } from '../_lib/auth';
import {
  ensureSeeded,
  getAllEmployees,
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

  const [settings, employees, holidayOverrides, scheduleOverrides] = await Promise.all([
    getSettings(env),
    getAllEmployees(env, false),
    getHolidayOverrides(env),
    getScheduleOverrides(env, from, to),
  ]);

  const days = computeScheduleRange({
    from,
    to,
    employees,
    settings,
    holidayOverrides,
    scheduleOverrides,
  });

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
