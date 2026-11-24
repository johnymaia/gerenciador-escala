import { getSessionUser } from '../../_lib/auth';
import { ensureSeeded, getSettings } from '../../_lib/db';
import { errorJson, json, type Env } from '../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) {
    return errorJson('Não autenticado.', 401);
  }
  const settings = await getSettings(env);
  return json({ user, settings });
};
