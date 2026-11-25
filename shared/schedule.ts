import {
  addDaysYmd,
  getClosedHolidayMap,
  parseYmd,
} from './holidays';
import type {
  DayEmployeeStatus,
  EmployeeDayHours,
  HolidayItem,
  HolidayOverrideRecord,
  HourAdjustmentRecord,
  PeriodHoursSummary,
  PublicEmployee,
  ScheduleDay,
  ScheduleOverrideRecord,
  ShopSettings,
} from './types';

export function getTodayBrazilYmd(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function getWeekday(ymd: string): number {
  return parseYmd(ymd).getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
}

export function getMondayOfWeek(ymd: string): string {
  const dow = getWeekday(ymd);
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(ymd, diff);
}

export function getSundayOfWeek(ymd: string): string {
  return addDaysYmd(getMondayOfWeek(ymd), 6);
}

export function getMonthRange(year: number, month1To12: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month1To12)}-01`;
  const lastDay = new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
  const to = `${year}-${pad(month1To12)}-${pad(lastDay)}`;
  return { from, to };
}

function diffDays(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd).getTime();
  const b = parseYmd(toYmd).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Motor do Rodízio — Opção B (Empurra a fila no feriado):
 * - O cálculo começa ESTRITAMENTE em `settings.rotation_start_date` como 1º dia.
 * - Dias anteriores a `rotation_start_date` ficam marcados como `before_start` (0h, sem folga).
 * - A partir de `rotation_start_date`:
 *   - Em semanas completas sem feriado (6 dias abertos Seg-Sáb), na virada do domingo
 *     a fila recua 1 posição para que toda a equipe avance +1 dia da semana
 *     (Seg -> Ter -> Qua -> Qui -> Sex -> Sáb -> Seg).
 *   - Quando cai um feriado (Seg-Sáb), o dia é pulado (loja fechada, 0h) e a folga é
 *     empurrada para o próximo dia aberto, sem prejudicar ninguém.
 *   - Na virada de domingo após semana parcial ou com feriado, a fila continua de onde
 *     parou (quem sobrou no sábado já folga na segunda seguinte).
 */
export function computeScheduleRange(params: {
  from: string;
  to: string;
  employees: PublicEmployee[];
  settings: ShopSettings;
  holidayOverrides: HolidayOverrideRecord[];
  scheduleOverrides: ScheduleOverrideRecord[];
}): ScheduleDay[] {
  const { from, to, employees, settings, holidayOverrides, scheduleOverrides } = params;

  const rotationEmployees = employees
    .filter((e) => e.active && e.in_rotation)
    .sort((a, b) => a.rotation_order - b.rotation_order || a.id - b.id);

  const N = rotationEmployees.length;
  const startDate = settings.rotation_start_date;
  const endLimit = to > startDate ? to : startDate;

  const minYear = Math.min(Number(from.slice(0, 4)), Number(startDate.slice(0, 4))) - 1;
  const maxYear = Math.max(Number(to.slice(0, 4)), Number(startDate.slice(0, 4))) + 1;
  const closedHolidays = getClosedHolidayMap(minYear, maxYear, holidayOverrides);

  // Map date -> base off employee id (somente para datas >= rotation_start_date)
  const baseOffByDate = new Map<string, number | null>();

  if (N > 0 && endLimit >= startDate) {
    let pointer = 0;
    let cur = startDate;
    let openDaysInWeek = 0;
    let holidaysInWeek = 0;

    while (cur <= endLimit) {
      const dow = getWeekday(cur);
      if (dow === 0) {
        // Domingo: fecha a semana e ajusta o ponteiro para a próxima segunda
        if (openDaysInWeek === 6 && holidaysInWeek === 0 && N > 1) {
          pointer = (pointer - 1 + N) % N;
        }
        openDaysInWeek = 0;
        holidaysInWeek = 0;
      } else if (closedHolidays.has(cur)) {
        holidaysInWeek++;
        baseOffByDate.set(cur, null);
      } else {
        openDaysInWeek++;
        baseOffByDate.set(cur, rotationEmployees[pointer].id);
        pointer = (pointer + 1) % N;
      }
      cur = addDaysYmd(cur, 1);
    }
  }

  // Index manual schedule overrides by `${date}:${employee_id}`
  const overrideMap = new Map<string, ScheduleOverrideRecord>();
  for (const ov of scheduleOverrides) {
    overrideMap.set(`${ov.date}:${ov.employee_id}`, ov);
  }

  const totalDays = diffDays(from, to);
  const days: ScheduleDay[] = [];

  for (let i = 0; i <= totalDays; i++) {
    const date = addDaysYmd(from, i);
    const weekday = getWeekday(date);
    const isSunday = weekday === 0;
    const isBeforeStart = date < startDate;
    const holiday: HolidayItem | null = !isSunday ? (closedHolidays.get(date) ?? null) : null;
    const baseOffId = !isBeforeStart && !isSunday && !holiday ? (baseOffByDate.get(date) ?? null) : null;

    const dayEmployees = rotationEmployees.map((emp) => {
      if (isBeforeStart) {
        return {
          employee_id: emp.id,
          name: emp.name,
          color: emp.color,
          status: 'before_start' as const,
          is_override: false,
          note: '',
        };
      }
      if (isSunday) {
        return {
          employee_id: emp.id,
          name: emp.name,
          color: emp.color,
          status: 'sunday' as const,
          is_override: false,
          note: '',
        };
      }
      if (holiday) {
        return {
          employee_id: emp.id,
          name: emp.name,
          color: emp.color,
          status: 'holiday' as const,
          is_override: false,
          note: holiday.name,
        };
      }

      const ov = overrideMap.get(`${date}:${emp.id}`);
      const isBaseOff = baseOffId === emp.id;
      const status: DayEmployeeStatus = ov ? ov.status : isBaseOff ? 'off' : 'work';

      return {
        employee_id: emp.id,
        name: emp.name,
        color: emp.color,
        status,
        is_override: Boolean(ov),
        note: ov?.note ?? '',
      };
    });

    const offIds = dayEmployees.filter((e) => e.status === 'off').map((e) => e.employee_id);

    days.push({
      date,
      weekday,
      is_sunday: isSunday,
      is_before_start: isBeforeStart,
      holiday,
      off_employee_ids: offIds,
      base_off_employee_id: baseOffId,
      employees: dayEmployees,
    });
  }

  return days;
}

export function computeEmployeePeriodHours(params: {
  employee: PublicEmployee;
  scheduleDays: ScheduleDay[];
  dailyHours: number;
  adjustments: HourAdjustmentRecord[];
}): PeriodHoursSummary {
  const { employee, scheduleDays, dailyHours, adjustments } = params;

  const adjByDate = new Map<string, HourAdjustmentRecord[]>();
  for (const adj of adjustments) {
    if (adj.employee_id !== employee.id) continue;
    const list = adjByDate.get(adj.date) ?? [];
    list.push(adj);
    adjByDate.set(adj.date, list);
  }

  let totalHours = 0;
  let baseHoursSum = 0;
  let adjHoursSum = 0;
  let workedDays = 0;
  let offDays = 0;
  let holidayDays = 0;
  let sundayDays = 0;

  const days: EmployeeDayHours[] = scheduleDays.map((day) => {
    const entry = day.employees.find((e) => e.employee_id === employee.id);
    const status: DayEmployeeStatus = day.is_before_start
      ? 'before_start'
      : entry
        ? entry.status
        : day.is_sunday
          ? 'sunday'
          : day.holiday
            ? 'holiday'
            : 'work';

    const baseHours = status === 'work' && employee.in_rotation ? dailyHours : 0;
    const dayAdjs = adjByDate.get(day.date) ?? [];
    const adjustmentHours = dayAdjs.reduce((acc, item) => acc + item.hours_delta, 0);
    const dayTotal = baseHours + adjustmentHours;

    if (status === 'work' && employee.in_rotation) workedDays++;
    else if (status === 'off') offDays++;
    else if (status === 'holiday') holidayDays++;
    else if (status === 'sunday') sundayDays++;

    baseHoursSum += baseHours;
    adjHoursSum += adjustmentHours;
    totalHours += dayTotal;

    return {
      date: day.date,
      weekday: day.weekday,
      status,
      holiday_name: day.holiday?.name ?? null,
      base_hours: baseHours,
      adjustment_hours: adjustmentHours,
      total_hours: dayTotal,
      adjustments: dayAdjs,
      note: entry?.note ?? '',
    };
  });

  return {
    from: scheduleDays[0]?.date ?? '',
    to: scheduleDays[scheduleDays.length - 1]?.date ?? '',
    total_hours: Math.round(totalHours * 100) / 100,
    base_hours: Math.round(baseHoursSum * 100) / 100,
    adjustment_hours: Math.round(adjHoursSum * 100) / 100,
    worked_days: workedDays,
    off_days: offDays,
    holiday_days: holidayDays,
    sunday_days: sundayDays,
    days,
  };
}
