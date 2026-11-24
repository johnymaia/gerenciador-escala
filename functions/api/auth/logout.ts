import { buildClearSessionCookie } from '../../_lib/auth';
import { json, type Env } from '../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  return json(
    { ok: true },
    200,
    { 'Set-Cookie': buildClearSessionCookie(request) },
  );
};
