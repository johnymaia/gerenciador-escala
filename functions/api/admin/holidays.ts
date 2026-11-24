import {
  buildHolidayMapForYears,
  getBuiltInHolidaysForYear,
  getOptionalDatesForYear,
} from '../../../shared/holidays';
import { getTodayBrazilYmd } from '../../../shared/schedule';
import { getSessionUser } from '../../_lib/auth';
import { ensureSeeded, getHolidayOverrides } from '../../_lib/db';
import { errorJson, isValidYmd, json, readJsonBody, type Env } from '../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);

  const url = new URL(request.url);
  const defaultYear = Number(getTodayBrazilYmd().slice(0, 4));
  const year = Number(url.searchParams.get('year') || defaultYear);
  if (!Number.isInteger(year) || year < 2020 || year > 2099) {
    return errorJson('Ano inválido.', 400);
  }

  const overrides = await getHolidayOverrides(env);
  const map = buildHolidayMapForYears(year, year, overrides);
  const holidays = Array.from(map.values())
    .filter((h) => h.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date));

  const optionalSuggestions = getOptionalDatesForYear(year).filter((opt) => !map.has(opt.date));

  return json({ year, holidays, optional_suggestions: optionalSuggestions });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const body = await readJsonBody<{
    date?: string;
    name?: string;
    is_closed?: boolean;
  }>(request);

  if (!body || !isValidYmd(body.date)) {
    return errorJson('Informe uma data válida (AAAA-MM-DD).', 400);
  }

  const year = Number(body.date.slice(0, 4));
  const builtIn = getBuiltInHolidaysForYear(year).find((h) => h.date === body.date);
  const name = body.name?.trim() || builtIn?.name || 'Feriado / Loja Fechada';
  const isClosed = body.is_closed !== undefined ? Boolean(body.is_closed) : true;
  const isCustom = !builtIn;

  await env.DB.prepare(
    `INSERT INTO holiday_overrides (date, name, is_closed, is_custom)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       name = excluded.name,
       is_closed = excluded.is_closed,
       is_custom = excluded.is_custom`,
  )
    .bind(body.date, name, isClosed ? 1 : 0, isCustom ? 1 : 0)
    .run();

  return json({ ok: true, date: body.date, name, is_closed: isClosed, is_custom: isCustom });
};
