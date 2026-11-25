import { getSessionUser, passwordChangeRequiredResponse } from '../../_lib/auth';
import { ensureSeeded, getSettings } from '../../_lib/db';
import { errorJson, isValidYmd, json, readJsonBody, type Env } from '../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  const settings = await getSettings(env);
  return json({ settings });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();
  if (user.role !== 'admin') return errorJson('Acesso restrito a administradores.', 403);

  const current = await getSettings(env);
  const body = await readJsonBody<{
    shop_name?: string;
    open_time?: string;
    close_time?: string;
    lunch_hours?: number;
    daily_hours?: number;
    rotation_start_date?: string;
    rotation_orders?: Array<{ id: number; rotation_order: number }>;
  }>(request);

  if (!body) return errorJson('Dados inválidos.', 400);

  const shopName = body.shop_name?.trim() || current.shop_name;
  const openTime = body.open_time || current.open_time;
  const closeTime = body.close_time || current.close_time;
  const lunchHours = typeof body.lunch_hours === 'number' ? body.lunch_hours : current.lunch_hours;
  const dailyHours = typeof body.daily_hours === 'number' && body.daily_hours > 0 ? body.daily_hours : current.daily_hours;
  // Mantém EXATAMENTE a data de início escolhida pelo administrador (1º dia do cálculo do rodízio)
  const rotationStart =
    body.rotation_start_date && isValidYmd(body.rotation_start_date)
      ? body.rotation_start_date
      : current.rotation_start_date;

  await env.DB.prepare(
    `UPDATE settings
     SET shop_name = ?, open_time = ?, close_time = ?, lunch_hours = ?, daily_hours = ?, rotation_start_date = ?
     WHERE id = 1`,
  )
    .bind(shopName, openTime, closeTime, lunchHours, dailyHours, rotationStart)
    .run();

  if (Array.isArray(body.rotation_orders) && body.rotation_orders.length > 0) {
    const stmts = body.rotation_orders.map((item) =>
      env.DB.prepare('UPDATE users SET rotation_order = ? WHERE id = ?').bind(item.rotation_order, item.id),
    );
    await env.DB.batch(stmts);
  }

  return json({
    settings: {
      shop_name: shopName,
      open_time: openTime,
      close_time: closeTime,
      lunch_hours: lunchHours,
      daily_hours: dailyHours,
      rotation_start_date: rotationStart,
    },
  });
};
