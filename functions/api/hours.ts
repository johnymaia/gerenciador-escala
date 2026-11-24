import {
  computeEmployeePeriodHours,
  computeScheduleRange,
  getMondayOfWeek,
  getMonthRange,
  getSundayOfWeek,
  getTodayBrazilYmd,
} from '../../shared/schedule';
import type { EmployeeHoursReport } from '../../shared/types';
import { getSessionUser } from '../_lib/auth';
import {
  ensureSeeded,
  getAllEmployees,
  getHolidayOverrides,
  getHourAdjustments,
  getScheduleOverrides,
  getSettings,
} from '../_lib/db';
import { errorJson, isValidYmd, json, type Env } from '../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);

  const url = new URL(request.url);
  const today = getTodayBrazilYmd();

  const weekRef = url.searchParams.get('weekDate') || today;
  if (!isValidYmd(weekRef)) return errorJson('Data de semana inválida.', 400);
  const weekFrom = getMondayOfWeek(weekRef);
  const weekTo = getSundayOfWeek(weekRef);

  const monthParam = url.searchParams.get('month') || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthParam)) return errorJson('Mês inválido.', 400);
  const [mYear, mNum] = monthParam.split('-').map(Number);
  if (mNum < 1 || mNum > 12) return errorJson('Mês inválido.', 400);
  const { from: monthFrom, to: monthTo } = getMonthRange(mYear, mNum);

  const overallFrom = weekFrom < monthFrom ? weekFrom : monthFrom;
  const overallTo = weekTo > monthTo ? weekTo : monthTo;

  const isAdmin = user.role === 'admin';

  const [settings, employees, holidayOverrides, scheduleOverrides, adjustments] = await Promise.all([
    getSettings(env),
    getAllEmployees(env, false),
    getHolidayOverrides(env),
    getScheduleOverrides(env, overallFrom, overallTo),
    // PRIVACIDADE ESTRITA: funcionário comum só consulta os próprios ajustes no banco!
    getHourAdjustments(env, overallFrom, overallTo, isAdmin ? undefined : user.id),
  ]);

  const allDays = computeScheduleRange({
    from: overallFrom,
    to: overallTo,
    employees,
    settings,
    holidayOverrides,
    scheduleOverrides,
  });

  const weekDays = allDays.filter((d) => d.date >= weekFrom && d.date <= weekTo);
  const monthDays = allDays.filter((d) => d.date >= monthFrom && d.date <= monthTo);

  // PRIVACIDADE ESTRITA: funcionário comum recebe SOMENTE o próprio relatório.
  const targetEmployees = isAdmin
    ? employees.filter((e) => e.in_rotation)
    : employees.filter((e) => e.id === user.id);

  const reports: EmployeeHoursReport[] = targetEmployees.map((emp) => ({
    employee: emp,
    week: computeEmployeePeriodHours({
      employee: emp,
      scheduleDays: weekDays,
      dailyHours: settings.daily_hours,
      adjustments,
    }),
    month: computeEmployeePeriodHours({
      employee: emp,
      scheduleDays: monthDays,
      dailyHours: settings.daily_hours,
      adjustments,
    }),
  }));

  return json({
    today,
    week: { from: weekFrom, to: weekTo },
    month: { key: monthParam, from: monthFrom, to: monthTo },
    daily_hours: settings.daily_hours,
    reports,
  });
};
