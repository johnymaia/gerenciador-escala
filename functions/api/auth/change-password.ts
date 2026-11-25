import {
  DEFAULT_USER_PASSWORD,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from '../../_lib/auth';
import { ensureSeeded } from '../../_lib/db';
import { errorJson, json, readJsonBody, type Env } from '../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);

  const body = await readJsonBody<{
    current_password?: string;
    new_password?: string;
  }>(request);

  if (!body?.new_password) {
    return errorJson('Informe a nova senha.', 400);
  }

  const newPass = body.new_password.trim();
  if (newPass.length < 4) {
    return errorJson('A nova senha precisa ter pelo menos 4 caracteres.', 400);
  }
  if (newPass === DEFAULT_USER_PASSWORD) {
    return errorJson(
      `A nova senha não pode ser a senha padrão (${DEFAULT_USER_PASSWORD}). Escolha uma senha pessoal.`,
      400,
    );
  }

  const row = await env.DB.prepare('SELECT password_hash, must_change_password FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ password_hash: string; must_change_password: number }>();

  if (!row) return errorJson('Usuário não encontrado.', 404);

  // Em troca voluntária (quando já não é 1º acesso), exige validação da senha atual
  if (!row.must_change_password) {
    if (!body.current_password) {
      return errorJson('Informe sua senha atual.', 400);
    }
    const currentOk = await verifyPassword(body.current_password, row.password_hash);
    if (!currentOk) {
      return errorJson('A senha atual está incorreta.', 400);
    }
  }

  const newHash = await hashPassword(newPass);
  await env.DB.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
  )
    .bind(newHash, user.id)
    .run();

  return json({
    ok: true,
    user: {
      ...user,
      must_change_password: false,
    },
  });
};
