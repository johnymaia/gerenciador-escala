import type { HolidayItem, HolidayOverrideRecord } from './types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return formatUtcDate(d);
}

/**
 * Calcula o Domingo de Páscoa (algoritmo gregoriano de Meeus/Jones/Butcher).
 */
export function getEasterSundayYmd(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Feriados oficiais do Brasil + Feriados Municipais de Belo Horizonte (MG)
 * conforme Lei Municipal nº 1.327/1967 e legislação federal vigente.
 */
export function getBuiltInHolidaysForYear(year: number): HolidayItem[] {
  const easter = getEasterSundayYmd(year);
  const goodFriday = addDaysYmd(easter, -2);
  const corpusChristi = addDaysYmd(easter, 60);

  const items: HolidayItem[] = [
    { date: `${year}-01-01`, name: 'Confraternização Universal', scope: 'nacional', is_closed: true, is_custom: false },
    { date: goodFriday, name: 'Sexta-Feira Santa (Paixão de Cristo)', scope: 'nacional', is_closed: true, is_custom: false },
    { date: `${year}-04-21`, name: 'Tiradentes', scope: 'nacional', is_closed: true, is_custom: false },
    { date: `${year}-05-01`, name: 'Dia Mundial do Trabalho', scope: 'nacional', is_closed: true, is_custom: false },
    { date: corpusChristi, name: 'Corpus Christi (BH)', scope: 'bh', is_closed: true, is_custom: false },
    { date: `${year}-08-15`, name: 'Assunção de N. Sra. — Padroeira de BH', scope: 'bh', is_closed: true, is_custom: false },
    { date: `${year}-09-07`, name: 'Independência do Brasil', scope: 'nacional', is_closed: true, is_custom: false },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida', scope: 'nacional', is_closed: true, is_custom: false },
    { date: `${year}-11-02`, name: 'Finados', scope: 'nacional', is_closed: true, is_custom: false },
    { date: `${year}-11-15`, name: 'Proclamação da República', scope: 'nacional', is_closed: true, is_custom: false },
    { date: `${year}-11-20`, name: 'Dia da Consciência Negra', scope: 'nacional', is_closed: true, is_custom: false },
    { date: `${year}-12-08`, name: 'Imaculada Conceição (BH)', scope: 'bh', is_closed: true, is_custom: false },
    { date: `${year}-12-25`, name: 'Natal', scope: 'nacional', is_closed: true, is_custom: false },
  ];

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

/**
 * Sugestões opcionais de ponto facultativo (ex: Carnaval em BH)
 * para o administrador adicionar rapidamente com 1 clique se a lotérica fechar.
 */
export function getOptionalDatesForYear(year: number): Array<{ date: string; name: string }> {
  const easter = getEasterSundayYmd(year);
  return [
    { date: addDaysYmd(easter, -48), name: 'Segunda de Carnaval (Ponto Facultativo)' },
    { date: addDaysYmd(easter, -47), name: 'Terça de Carnaval (Ponto Facultativo)' },
    { date: addDaysYmd(easter, -46), name: 'Quarta-Feira de Cinzas' },
  ];
}

/**
 * Mescla feriados oficiais (BR + BH) com os overrides/cadastros manuais do banco.
 */
export function buildHolidayMapForYears(
  startYear: number,
  endYear: number,
  overrides: HolidayOverrideRecord[],
): Map<string, HolidayItem> {
  const map = new Map<string, HolidayItem>();

  for (let y = startYear; y <= endYear; y++) {
    for (const h of getBuiltInHolidaysForYear(y)) {
      map.set(h.date, { ...h });
    }
  }

  for (const ov of overrides) {
    const existing = map.get(ov.date);
    if (existing) {
      map.set(ov.date, {
        ...existing,
        name: ov.name || existing.name,
        is_closed: ov.is_closed,
      });
    } else {
      map.set(ov.date, {
        date: ov.date,
        name: ov.name,
        scope: 'manual',
        is_closed: ov.is_closed,
        is_custom: true,
      });
    }
  }

  return map;
}

export function getClosedHolidayMap(
  startYear: number,
  endYear: number,
  overrides: HolidayOverrideRecord[],
): Map<string, HolidayItem> {
  const all = buildHolidayMapForYears(startYear, endYear, overrides);
  const closed = new Map<string, HolidayItem>();
  for (const [date, item] of all.entries()) {
    if (item.is_closed) {
      closed.set(date, item);
    }
  }
  return closed;
}
