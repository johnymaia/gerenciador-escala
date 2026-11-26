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
 * Motor do Rodízio — Ciclo Fixo Semanal (Não pula a fila no feriado):
 * - O cálculo começa ESTRITAMENTE em `settings.rotation_start_date` como 1º dia.
 * - Dias anteriores a `rotation_start_date` ficam marcados como `before_start` (0h, sem folga).
 * - A partir de `rotation_start_date`:
 *   - Os 6 dias da semana (Seg–Sáb) avançam normalmente o ponteiro da fila (1 posição por dia),
 *     independentemente de haver feriado na semana.
 *   - Quando um dia (Seg–Sáb) é feriado fechado, a loja fecha para todos (`status: 'holiday'`)
 *     e a posição daquele dia avança normalmente (a folga da pessoa escalada naquele dia coincide
 *     com o feriado, sem empurrar nem prejudicar as folgas dos outros dias da semana e sem tirar
 *     o Sábado de ninguém).
 *   - Ao fechar uma semana completa de 6 dias (Seg–Sáb) na virada do domingo, a fila recua 1 posição
 *     para que toda a equipe avance religiosamente +1 dia da semana na semana seguinte
 *     (Seg -> Ter -> Qua -> Qui -> Sex -> Sáb -> Seg).
 */
export function computeScheduleRange(params: {
  from: string;
  to: string;
  employees: PublicEmployee[];
  settings: ShopSettings;
  holidayOverrides: HolidayOverrideRecord[];
  scheduleOverrides: ScheduleOverrideRecord[];
  approvedVacations?: Array<{ employee_id: number; start_date: string; end_date: string }>;
}): ScheduleDay[] {
  const {
    from,
    to,
    employees,
    settings,
    holidayOverrides,
    scheduleOverrides,
    approvedVacations = [],
  } = params;

  const rotationEmployees = employees
    .filter((e) => e.active && e.in_rotation)
    .sort((a, b) => a.rotation_order - b.rotation_order || a.id - b.id);

  const empNameById = new Map<number, string>();
  for (const emp of employees) {
    empNameById.set(emp.id, emp.name);
  }

  const N = rotationEmployees.length;
  const startDate = settings.rotation_start_date;
  // Garante que o cálculo do ponteiro vá até o sábado da última semana solicitada para avaliar a cascata de sábado
  const sundayOfTo = getSundayOfWeek(to);
  const endLimit = sundayOfTo > startDate ? sundayOfTo : startDate;

  const minYear = Math.min(Number(from.slice(0, 4)), Number(startDate.slice(0, 4))) - 1;
  const maxYear = Math.max(Number(endLimit.slice(0, 4)), Number(startDate.slice(0, 4))) + 1;
  const closedHolidays = getClosedHolidayMap(minYear, maxYear, holidayOverrides);

  // Map date -> base off employee id (somente para datas >= rotation_start_date)
  const baseOffByDate = new Map<string, number | null>();

  if (N > 0 && endLimit >= startDate) {
    let pointer = 0;
    let cur = startDate;
    let weekdaysInWeek = 0;

    while (cur <= endLimit) {
      const dow = getWeekday(cur);
      if (dow === 0) {
        // Domingo: fecha a semana e recua 1 posição quando a semana teve os 6 dias (Seg-Sáb),
        // garantindo que todos avancem +1 dia da semana na segunda-feira seguinte
        if (weekdaysInWeek === 6 && N > 1) {
          pointer = (pointer - 1 + N) % N;
        }
        weekdaysInWeek = 0;
      } else {
        weekdaysInWeek++;
        if (closedHolidays.has(cur)) {
          baseOffByDate.set(cur, null);
        } else {
          baseOffByDate.set(cur, rotationEmployees[pointer].id);
        }
        pointer = (pointer + 1) % N;
      }
      cur = addDaysYmd(cur, 1);
    }
  }

  // Regra de Férias Aprovadas + Folga Semanal:
  // 1. Se `settings.saturday_vacation_cascade` estiver ATIVADO (padrão):
  //    - Quando a pessoa que folga no Sábado está em férias aprovadas, a colega da Sexta
  //      (ou da Quinta, se a Sexta for feriado fechado) pula automaticamente para o Sábado,
  //      e a Sexta (ou Quinta) fica como Folga Livre.
  // 2. Para qualquer dia útil aberto (Seg a Sáb — incluindo o Sábado quando a cascata estiver desativada):
  //    - Se a pessoa que folgaria naquele dia está em Férias Aprovadas, a sinalização de folga dela
  //      some (`effectiveOffByDate.set(cur, null)`) e o dia vira Folga Livre (`openOffDates.add(cur)`),
  //      disponível para qualquer colega solicitar com aprovação única do Administrador!
  // - Tudo é aplicado sobre uma cópia pós-ponteiro para NÃO alterar o rodízio das semanas seguintes!
  const effectiveOffByDate = new Map<string, number | null>(baseOffByDate);
  const openOffDates = new Set<string>();
  const cascadeInfoByDate = new Map<string, string>();

  const isOnApprovedVacation = (empId: number, ymd: string): boolean =>
    approvedVacations.some(
      (v) => v.employee_id === empId && v.start_date <= ymd && v.end_date >= ymd,
    );

  const saturdayCascadeEnabled = settings.saturday_vacation_cascade !== false;

  if (N > 0 && approvedVacations.length > 0 && endLimit >= startDate) {
    // Passo 1: Pulo automático de Sexta (ou Quinta) para o Sábado, se habilitado nas configurações
    if (saturdayCascadeEnabled) {
      let cur = startDate;
      while (cur <= endLimit) {
        if (getWeekday(cur) === 6) {
          // É um sábado >= startDate
          const satEmpId = baseOffByDate.get(cur) ?? null;
          if (satEmpId !== null && isOnApprovedVacation(satEmpId, cur)) {
            const satName = empNameById.get(satEmpId) || 'Colega';
            const friDate = addDaysYmd(cur, -1); // Sexta
            const thuDate = addDaysYmd(cur, -2); // Quinta

            const friOpen = friDate >= startDate && !closedHolidays.has(friDate);
            const thuOpen = thuDate >= startDate && !closedHolidays.has(thuDate);

            const friEmpId = friOpen ? (baseOffByDate.get(friDate) ?? null) : null;
            const thuEmpId = thuOpen ? (baseOffByDate.get(thuDate) ?? null) : null;

            if (friOpen && friEmpId !== null && !isOnApprovedVacation(friEmpId, cur)) {
              const friName = empNameById.get(friEmpId) || 'Colega';
              // Somente a pessoa da Sexta pula para a folga do Sábado, e a Sexta fica Livre
              effectiveOffByDate.set(cur, friEmpId);
              effectiveOffByDate.set(friDate, null);
              openOffDates.add(friDate);

              cascadeInfoByDate.set(
                cur,
                `Remanejamento automático: como ${satName} está de férias no sábado, ${friName} pulou da sexta para o sábado.`,
              );
              cascadeInfoByDate.set(
                friDate,
                `Folga Livre: ${friName} pulou para o sábado (férias de ${satName} no sábado). Qualquer colega pode solicitar esta sexta-feira com aprovação do administrador!`,
              );
            } else if (!friOpen && thuOpen && thuEmpId !== null && !isOnApprovedVacation(thuEmpId, cur)) {
              // Sexta é feriado / loja fechada: a pessoa da Quinta pula direto para o Sábado e a Quinta fica Livre
              const thuName = empNameById.get(thuEmpId) || 'Colega';
              effectiveOffByDate.set(cur, thuEmpId);
              effectiveOffByDate.set(thuDate, null);
              openOffDates.add(thuDate);

              cascadeInfoByDate.set(
                cur,
                `Remanejamento automático: como ${satName} está de férias no sábado (e sexta a loja está fechada), ${thuName} pulou da quinta para o sábado.`,
              );
              cascadeInfoByDate.set(
                thuDate,
                `Folga Livre: ${thuName} pulou para o sábado (férias de ${satName} no sábado e sexta fechada). Qualquer colega pode solicitar esta quinta-feira com aprovação do administrador!`,
              );
            }
          }
        }
        cur = addDaysYmd(cur, 1);
      }
    }

    // Passo 2: Para qualquer dia útil aberto onde a funcionária da folga está em Férias Aprovadas,
    // remove a sinalização de folga duplicada e transforma o dia em Folga Livre!
    let curDay = startDate;
    while (curDay <= endLimit) {
      const curEmpId = effectiveOffByDate.get(curDay) ?? null;
      if (curEmpId !== null && isOnApprovedVacation(curEmpId, curDay)) {
        const empName = empNameById.get(curEmpId) || 'Colega';
        effectiveOffByDate.set(curDay, null);
        openOffDates.add(curDay);
        if (!cascadeInfoByDate.has(curDay)) {
          cascadeInfoByDate.set(
            curDay,
            `Folga Livre: ${empName} está em férias aprovadas no seu dia de folga. Qualquer colega pode solicitar esta data com aprovação única do administrador!`,
          );
        }
      }
      curDay = addDaysYmd(curDay, 1);
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
    const baseOffId = !isBeforeStart && !isSunday && !holiday ? (effectiveOffByDate.get(date) ?? null) : null;
    const cascadeInfo = cascadeInfoByDate.get(date) ?? null;

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

      if (isOnApprovedVacation(emp.id, date)) {
        return {
          employee_id: emp.id,
          name: emp.name,
          color: emp.color,
          status: 'vacation' as const,
          is_override: false,
          note: 'Férias aprovadas',
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
    const hasOverride = dayEmployees.some((e) => e.is_override);
    // Continua marcada como Folga Livre aberta enquanto ninguém tiver assumido folga naquele dia
    const isOpenOff = openOffDates.has(date) && offIds.length === 0;

    days.push({
      date,
      weekday,
      is_sunday: isSunday,
      is_before_start: isBeforeStart,
      holiday,
      off_employee_ids: offIds,
      base_off_employee_id: baseOffId,
      is_open_off: isOpenOff,
      cascade_info: cascadeInfo,
      employees: dayEmployees,
      swaps: [],
      vacations: [],
      has_manual_change: hasOverride,
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
