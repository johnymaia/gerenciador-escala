import { getTodayBrazilYmd } from '../../../../shared/schedule';
import type { ApprovalState, SwapOverallStatus } from '../../../../shared/types';
import { getSessionUser, passwordChangeRequiredResponse } from '../../../_lib/auth';
import { ensureSeeded } from '../../../_lib/db';
import { errorJson, json, readJsonBody, type Env } from '../../../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  await ensureSeeded(env);
  const user = await getSessionUser(request, env);
  if (!user) return errorJson('Não autenticado.', 401);
  if (user.must_change_password) return passwordChangeRequiredResponse();

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return errorJson('ID inválido.', 400);

  const swap = await env.DB.prepare(
    `SELECT id, requester_id, requester_date, target_id, target_date, reason,
            is_open_swap, target_status, admin_status, status
     FROM swap_requests WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: number;
      requester_id: number;
      requester_date: string;
      target_id: number;
      target_date: string;
      reason: string;
      is_open_swap: number;
      target_status: ApprovalState;
      admin_status: ApprovalState;
      status: SwapOverallStatus;
    }>();

  if (!swap) return errorJson('Solicitação não encontrada.', 404);
  const isOpenSwap = Boolean(swap.is_open_swap);

  const body = await readJsonBody<{
    decision?: 'approved' | 'rejected' | 'cancelled' | 'undo';
    as?: 'target' | 'admin';
  }>(request);

  if (!body?.decision || !['approved', 'rejected', 'cancelled', 'undo'].includes(body.decision)) {
    return errorJson('Decisão inválida.', 400);
  }

  // Desfazer uma troca já aprovada (permitido apenas para qualquer Administrador, se nenhuma data passou)
  if (body.decision === 'undo') {
    if (swap.status !== 'approved') {
      return errorJson('Apenas trocas já aprovadas podem ser desfeitas.', 400);
    }

    if (user.role !== 'admin') {
      return errorJson('Apenas administradores podem desfazer uma troca aprovada.', 403);
    }

    const today = getTodayBrazilYmd();
    if (swap.requester_date < today || swap.target_date < today) {
      return errorJson(
        'Não é possível desfazer esta troca porque uma das datas já passou.',
        400,
      );
    }

    if (isOpenSwap) {
      await env.DB.batch([
        env.DB.prepare("UPDATE swap_requests SET status = 'cancelled' WHERE id = ?").bind(id),
        env.DB.prepare('DELETE FROM schedule_overrides WHERE date = ? AND employee_id = ?').bind(
          swap.requester_date,
          swap.requester_id,
        ),
        env.DB.prepare('DELETE FROM schedule_overrides WHERE date = ? AND employee_id = ?').bind(
          swap.target_date,
          swap.requester_id,
        ),
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare("UPDATE swap_requests SET status = 'cancelled' WHERE id = ?").bind(id),
        env.DB.prepare('DELETE FROM schedule_overrides WHERE date = ? AND employee_id = ?').bind(
          swap.requester_date,
          swap.requester_id,
        ),
        env.DB.prepare('DELETE FROM schedule_overrides WHERE date = ? AND employee_id = ?').bind(
          swap.target_date,
          swap.requester_id,
        ),
        env.DB.prepare('DELETE FROM schedule_overrides WHERE date = ? AND employee_id = ?').bind(
          swap.target_date,
          swap.target_id,
        ),
        env.DB.prepare('DELETE FROM schedule_overrides WHERE date = ? AND employee_id = ?').bind(
          swap.requester_date,
          swap.target_id,
        ),
      ]);
    }

    return json({ ok: true, status: 'cancelled', undone: true });
  }

  if (swap.status !== 'pending') {
    return errorJson('Esta solicitação já foi finalizada.', 400);
  }

  // Cancelamento por quem solicitou
  if (body.decision === 'cancelled') {
    if (swap.requester_id !== user.id) {
      return errorJson('Apenas quem pediu a troca pode cancelar a solicitação.', 403);
    }
    await env.DB.prepare("UPDATE swap_requests SET status = 'cancelled' WHERE id = ?")
      .bind(id)
      .run();
    return json({ ok: true, status: 'cancelled' });
  }

  const isTarget = !isOpenSwap && swap.target_id === user.id;
  const isAdmin = user.role === 'admin';

  // Decide qual papel está respondendo (colega ou administrador)
  let actingAs: 'target' | 'admin' | null = null;
  if (body.as === 'target' && isTarget) actingAs = 'target';
  else if (body.as === 'admin' && isAdmin) actingAs = 'admin';
  else if (isTarget && swap.target_status === 'pending') actingAs = 'target';
  else if (isAdmin && swap.admin_status === 'pending') actingAs = 'admin';

  if (!actingAs) {
    return errorJson('Você não tem permissão ou já respondeu a esta solicitação.', 403);
  }

  if (actingAs === 'target' && swap.target_status !== 'pending') {
    return errorJson('A aprovação da colega já foi registrada.', 400);
  }
  if (actingAs === 'admin' && swap.admin_status !== 'pending') {
    return errorJson('A aprovação do administrador já foi registrada.', 400);
  }

  const nextTargetStatus: ApprovalState =
    actingAs === 'target' ? body.decision : swap.target_status;
  const nextAdminStatus: ApprovalState =
    actingAs === 'admin' ? body.decision : swap.admin_status;

  let nextOverallStatus: SwapOverallStatus = 'pending';
  if (nextTargetStatus === 'rejected' || nextAdminStatus === 'rejected') {
    nextOverallStatus = 'rejected';
  } else if (nextTargetStatus === 'approved' && nextAdminStatus === 'approved') {
    nextOverallStatus = 'approved';
  }

  const nowIso = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  if (actingAs === 'target') {
    statements.push(
      env.DB.prepare(
        `UPDATE swap_requests
         SET target_status = ?, target_decided_at = ?, status = ?
         WHERE id = ?`,
      ).bind(nextTargetStatus, nowIso, nextOverallStatus, id),
    );
  } else {
    statements.push(
      env.DB.prepare(
        `UPDATE swap_requests
         SET admin_status = ?, admin_decided_by = ?, admin_decided_at = ?, status = ?
         WHERE id = ?`,
      ).bind(nextAdminStatus, user.id, nowIso, nextOverallStatus, id),
    );
  }

  // Quando AMBAS as aprovações (colega + administrador, ou somente admin em Folga Livre) forem confirmadas, aplica automaticamente na escala!
  if (nextOverallStatus === 'approved') {
    if (isOpenSwap) {
      // Garante que nenhuma outra pessoa já ocupou essa Folga Livre antes
      const alreadyTaken = await env.DB.prepare(
        `SELECT employee_id FROM schedule_overrides WHERE date = ? AND status = 'off' AND employee_id != ? LIMIT 1`,
      )
        .bind(swap.target_date, swap.requester_id)
        .first();

      if (alreadyTaken) {
        return errorJson(
          'Esta Folga Livre já foi preenchida por outra colaboradora.',
          409,
        );
      }

      const note = swap.reason
        ? `Folga Livre aprovada: ${swap.reason}`
        : 'Assumiu Folga Livre (remanejamento de férias)';
      statements.push(
        env.DB.prepare(
          `INSERT INTO schedule_overrides (date, employee_id, status, note)
           VALUES (?, ?, 'work', ?)
           ON CONFLICT(date, employee_id) DO UPDATE SET status = 'work', note = excluded.note`,
        ).bind(swap.requester_date, swap.requester_id, note),
        env.DB.prepare(
          `INSERT INTO schedule_overrides (date, employee_id, status, note)
           VALUES (?, ?, 'off', ?)
           ON CONFLICT(date, employee_id) DO UPDATE SET status = 'off', note = excluded.note`,
        ).bind(swap.target_date, swap.requester_id, note),
      );
    } else {
      const note = swap.reason ? `Troca aprovada: ${swap.reason}` : 'Troca de folga aprovada';
      statements.push(
        env.DB.prepare(
          `INSERT INTO schedule_overrides (date, employee_id, status, note)
           VALUES (?, ?, 'work', ?)
           ON CONFLICT(date, employee_id) DO UPDATE SET status = 'work', note = excluded.note`,
        ).bind(swap.requester_date, swap.requester_id, note),
        env.DB.prepare(
          `INSERT INTO schedule_overrides (date, employee_id, status, note)
           VALUES (?, ?, 'off', ?)
           ON CONFLICT(date, employee_id) DO UPDATE SET status = 'off', note = excluded.note`,
        ).bind(swap.target_date, swap.requester_id, note),
        env.DB.prepare(
          `INSERT INTO schedule_overrides (date, employee_id, status, note)
           VALUES (?, ?, 'work', ?)
           ON CONFLICT(date, employee_id) DO UPDATE SET status = 'work', note = excluded.note`,
        ).bind(swap.target_date, swap.target_id, note),
        env.DB.prepare(
          `INSERT INTO schedule_overrides (date, employee_id, status, note)
           VALUES (?, ?, 'off', ?)
           ON CONFLICT(date, employee_id) DO UPDATE SET status = 'off', note = excluded.note`,
        ).bind(swap.requester_date, swap.target_id, note),
      );
    }
  }

  await env.DB.batch(statements);

  return json({
    ok: true,
    status: nextOverallStatus,
    target_status: nextTargetStatus,
    admin_status: nextAdminStatus,
  });
};
