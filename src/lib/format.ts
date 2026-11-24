import { parseYmd } from '../../shared/holidays';

const WEEKDAYS_FULL = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MONTHS_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function weekdayFull(dow: number): string {
  return WEEKDAYS_FULL[dow] ?? '';
}

export function weekdayShort(dow: number): string {
  return WEEKDAYS_SHORT[dow] ?? '';
}

export function formatDayMonth(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

export function formatFullDateBr(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function formatFriendlyDate(ymd: string): string {
  const d = parseYmd(ymd);
  const day = d.getUTCDate();
  const month = MONTHS_SHORT[d.getUTCMonth()];
  return `${day} de ${month}`;
}

export function formatMonthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_FULL[(m || 1) - 1]} ${y}`;
}

export function formatWeekRange(from: string, to: string): string {
  return `${formatDayMonth(from)} – ${formatDayMonth(to)}`;
}

export function formatHours(h: number): string {
  if (Number.isInteger(h)) return `${h}h`;
  return `${h.toFixed(1).replace('.', ',')}h`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
