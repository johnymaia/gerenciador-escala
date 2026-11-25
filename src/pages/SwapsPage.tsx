import {
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDaysYmd } from '../../shared/holidays';
import { getTodayBrazilYmd, getWeekday } from '../../shared/schedule';
import type {
  ApprovalState,
  PublicEmployee,
  ScheduleDay,
  SwapRequestItem,
} from '../../shared/types';
import { Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { formatDayMonth, weekdayShort } from '../lib/format';

interface SwapsPageProps {
  user: PublicEmployee;
  onPendingCountChange?: (count: number) => void;
}

export function SwapsPage({ user, onPendingCountChange }: SwapsPageProps) {
  const isAdmin = user.role === 'admin';
  const [requests, setRequests] = useState<SwapRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  // Filtros
  const [empFilter, setEmpFilter] = useState<'received' | 'sent'>('received');
  const [adminFilter, setAdminFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Modal de nova solicitação
  const [newOpen, setNewOpen] = useState(false);
  const [upcomingDays, setUpcomingDays] = useState<ScheduleDay[]>([]);
  const [colleagues, setColleagues] = useState<PublicEmployee[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [myDate, setMyDate] = useState('');
  const [targetId, setTargetId] = useState<number>(0);
  const [targetDate, setTargetDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadSwaps = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listSwaps();
      setRequests(res.requests);
      onPendingCountChange?.(res.pending_action_count);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar solicitações.');
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    loadSwaps();
  }, [loadSwaps]);

  // Se for funcionária e não tiver nenhuma recebida pendente mas tiver enviadas, facilita visualização
  const receivedRequests = useMemo(
    () => requests.filter((r) => r.target_id === user.id),
    [requests, user.id],
  );
  const sentRequests = useMemo(
    () => requests.filter((r) => r.requester_id === user.id),
    [requests, user.id],
  );
  const receivedPendingCount = useMemo(
    () =>
      receivedRequests.filter((r) => r.status === 'pending' && r.target_status === 'pending')
        .length,
    [receivedRequests],
  );

  const adminPendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending' && r.admin_status === 'pending').length,
    [requests],
  );

  const visibleRequests = useMemo(() => {
    if (isAdmin) {
      if (adminFilter === 'all') return requests;
      if (adminFilter === 'rejected') {
        return requests.filter((r) => r.status === 'rejected' || r.status === 'cancelled');
      }
      return requests.filter((r) => r.status === adminFilter);
    }
    return empFilter === 'received' ? receivedRequests : sentRequests;
  }, [isAdmin, adminFilter, empFilter, requests, receivedRequests, sentRequests]);

  // Opções de datas para o modal de nova troca
  const myOffOptions = useMemo(
    () => upcomingDays.filter((d) => d.off_employee_ids.includes(user.id)),
    [upcomingDays, user.id],
  );

  const targetOffOptions = useMemo(
    () =>
      upcomingDays.filter(
        (d) => targetId > 0 && d.off_employee_ids.includes(targetId) && d.date !== myDate,
      ),
    [upcomingDays, targetId, myDate],
  );

  async function openNewSwapModal() {
    setNewOpen(true);
    setLoadingOptions(true);
    setError('');
    setReason('');
    try {
      const today = getTodayBrazilYmd();
      const end = addDaysYmd(today, 60);
      const sched = await api.getSchedule(today, end);
      setUpcomingDays(sched.days);
      const others = sched.employees.filter((e) => e.id !== user.id);
      setColleagues(others);

      const firstMyOff = sched.days.find((d) => d.off_employee_ids.includes(user.id));
      const firstColleague = others[0];
      const firstTargetOff = firstColleague
        ? sched.days.find(
            (d) => d.off_employee_ids.includes(firstColleague.id) && d.date !== firstMyOff?.date,
          )
        : undefined;

      setMyDate(firstMyOff?.date || '');
      setTargetId(firstColleague?.id || 0);
      setTargetDate(firstTargetOff?.date || '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar datas de folga.');
    } finally {
      setLoadingOptions(false);
    }
  }

  function handleTargetChange(nextTargetId: number) {
    setTargetId(nextTargetId);
    const firstOff = upcomingDays.find(
      (d) => d.off_employee_ids.includes(nextTargetId) && d.date !== myDate,
    );
    setTargetDate(firstOff?.date || '');
  }

  async function handleCreateSwap(e: React.FormEvent) {
    e.preventDefault();
    if (!myDate || !targetId || !targetDate) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await api.createSwapRequest({
        requester_date: myDate,
        target_id: targetId,
        target_date: targetDate,
        reason,
      });
      setNewOpen(false);
      if (!isAdmin) setEmpFilter('sent');
      setNotice(
        'Solicitação enviada! Ela ficará pendente até ser aprovada pela colega e pelo administrador.',
      );
      await loadSwaps();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao enviar solicitação.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespond(
    swap: SwapRequestItem,
    decision: 'approved' | 'rejected' | 'cancelled',
    as?: 'target' | 'admin',
  ) {
    setSavingId(swap.id);
    setError('');
    setNotice('');
    try {
      const res = await api.respondSwapRequest(swap.id, { decision, as });
      if (res.status === 'approved') {
        setNotice('Troca aprovada por ambos e já aplicada automaticamente na escala!');
      } else if (decision === 'approved') {
        setNotice('Sua aprovação foi registrada! Aguardando a outra aprovação.');
      } else if (decision === 'rejected') {
        setNotice('Solicitação recusada.');
      } else {
        setNotice('Solicitação cancelada.');
      }
      await loadSwaps();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao responder solicitação.');
    } finally {
      setSavingId(null);
    }
  }

  const selectedColleague = colleagues.find((c) => c.id === targetId);

  return (
    <div className="space-y-4">
      {/* Cabeçalho de ações e filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isAdmin ? (
          <div className="inline-flex rounded-xl border border-slate-200/80 bg-white p-1 shadow-2xs">
            {(
              [
                { key: 'pending', label: 'Pendentes', count: adminPendingCount },
                { key: 'approved', label: 'Aprovadas', count: 0 },
                { key: 'rejected', label: 'Recusadas', count: 0 },
                { key: 'all', label: 'Todas', count: 0 },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setAdminFilter(f.key)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  adminFilter === f.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {f.label}
                {f.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      adminFilter === f.key
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="inline-flex rounded-xl border border-slate-200/80 bg-white p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setEmpFilter('received')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                empFilter === 'received'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Recebidas
              {receivedPendingCount > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold ${
                    empFilter === 'received'
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {receivedPendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setEmpFilter('sent')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                empFilter === 'sent'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Meus pedidos ({sentRequests.length})
            </button>
          </div>
        )}

        {user.in_rotation && (
          <button
            type="button"
            onClick={openNewSwapModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            Pedir troca
          </button>
        )}
      </div>

      {notice && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-44 items-center justify-center rounded-2xl border border-slate-200/80 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            Nenhuma solicitação por aqui
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {isAdmin
              ? 'Quando alguma funcionária pedir troca de folga, ela aparecerá aqui para aprovação.'
              : empFilter === 'received'
                ? 'Você não tem pedidos de troca recebidos de colegas.'
                : 'Use o botão "Pedir troca" para solicitar uma troca de folga com uma colega.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map((swap) => (
            <SwapCard
              key={swap.id}
              swap={swap}
              currentUser={user}
              saving={savingId === swap.id}
              onRespond={handleRespond}
            />
          ))}
        </div>
      )}

      {/* Modal: Pedir troca de folga */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Pedir troca de folga"
        subtitle="A troca precisa da aprovação da colega e de um administrador"
      >
        {loadingOptions ? (
          <div className="flex h-36 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
          </div>
        ) : myOffOptions.length === 0 || colleagues.length === 0 ? (
          <p className="text-sm text-slate-500">
            Não foram encontradas folgas futuras disponíveis para troca.
          </p>
        ) : (
          <form onSubmit={handleCreateSwap} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                1. Sua folga atual que deseja trocar
              </label>
              <select
                required
                value={myDate}
                onChange={(e) => setMyDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              >
                {myOffOptions.map((d) => (
                  <option key={d.date} value={d.date}>
                    {weekdayShort(d.weekday)}, {formatDayMonth(d.date)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                2. Colega com quem quer trocar
              </label>
              <select
                required
                value={targetId}
                onChange={(e) => handleTargetChange(Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              >
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                3. Dia de folga de {selectedColleague?.name || 'colega'} que você quer pegar
              </label>
              <select
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              >
                {targetOffOptions.map((d) => (
                  <option key={d.date} value={d.date}>
                    {weekdayShort(d.weekday)}, {formatDayMonth(d.date)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Motivo / observação (opcional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: Consulta médica, compromisso..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>

            {myDate && targetDate && selectedColleague && (
              <div className="rounded-2xl border border-teal-200/80 bg-teal-50/60 p-3 text-xs text-teal-900">
                Você passa a folgar em{' '}
                <strong>
                  {weekdayShort(getWeekday(targetDate))}, {formatDayMonth(targetDate)}
                </strong>{' '}
                e <strong>{selectedColleague.name}</strong> passa a folgar em{' '}
                <strong>
                  {weekdayShort(getWeekday(myDate))}, {formatDayMonth(myDate)}
                </strong>
                .
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !myDate || !targetDate}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar solicitação
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}

function ApprovalPill({
  label,
  state,
  detail,
}: {
  label: string;
  state: ApprovalState;
  detail?: string;
}) {
  if (state === 'approved') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{label}</div>
          <div className="text-[11px] text-emerald-700">Aprovou{detail ? ` (${detail})` : ''}</div>
        </div>
      </div>
    );
  }
  if (state === 'rejected') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-900">
        <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{label}</div>
          <div className="text-[11px] text-rose-700">Recusou{detail ? ` (${detail})` : ''}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
      <Clock className="h-4 w-4 shrink-0 text-amber-600" />
      <div className="min-w-0">
        <div className="truncate font-semibold">{label}</div>
        <div className="text-[11px] text-amber-700">Falta aprovar</div>
      </div>
    </div>
  );
}

function SwapCard({
  swap,
  currentUser,
  saving,
  onRespond,
}: {
  swap: SwapRequestItem;
  currentUser: PublicEmployee;
  saving: boolean;
  onRespond: (
    swap: SwapRequestItem,
    decision: 'approved' | 'rejected' | 'cancelled',
    as?: 'target' | 'admin',
  ) => void;
}) {
  const isAdmin = currentUser.role === 'admin';
  const isTarget = swap.target_id === currentUser.id;
  const isRequester = swap.requester_id === currentUser.id;

  const canActAsTarget =
    swap.status === 'pending' && isTarget && swap.target_status === 'pending';
  const canActAsAdmin =
    swap.status === 'pending' && isAdmin && swap.admin_status === 'pending';
  const canCancel = swap.status === 'pending' && isRequester;

  let statusHeader = '';
  let statusBadgeClass = 'bg-amber-100 text-amber-800';
  let statusSummary = '';

  if (swap.status === 'approved') {
    statusHeader = 'Aprovada';
    statusBadgeClass = 'bg-emerald-100 text-emerald-800';
    statusSummary = 'Aprovada por ambos e aplicada automaticamente na escala.';
  } else if (swap.status === 'rejected') {
    statusHeader = 'Recusada';
    statusBadgeClass = 'bg-rose-100 text-rose-700';
    statusSummary =
      swap.target_status === 'rejected'
        ? `Recusada por ${swap.target_name}.`
        : `Recusada pelo administrador${swap.admin_decided_by_name ? ` (${swap.admin_decided_by_name})` : ''}.`;
  } else if (swap.status === 'cancelled') {
    statusHeader = 'Cancelada';
    statusBadgeClass = 'bg-slate-100 text-slate-500';
    statusSummary = `Cancelada por ${swap.requester_name}.`;
  } else {
    statusHeader = 'Pendente';
    if (swap.target_status === 'pending' && swap.admin_status === 'pending') {
      statusSummary = `Faltam 2 aprovações: ${swap.target_name} e Administrador.`;
    } else if (swap.target_status === 'approved' && swap.admin_status === 'pending') {
      statusSummary = `${swap.target_name} já aprovou — falta apenas aprovação do Administrador.`;
    } else if (swap.target_status === 'pending' && swap.admin_status === 'approved') {
      statusSummary = `Administrador já aprovou — falta apenas aprovação de ${swap.target_name}.`;
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: swap.requester_color }}
          />
          <span>{swap.requester_name}</span>
          <ArrowLeftRight className="h-3.5 w-3.5 text-slate-400" />
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: swap.target_color }}
          />
          <span>{swap.target_name}</span>
        </div>

        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}>
          {statusHeader}
        </span>
      </div>

      {/* Datas trocadas */}
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
        <div>
          <span className="text-[10px] font-medium uppercase text-slate-400">
            Folga de {swap.requester_name}
          </span>
          <div className="mt-0.5 font-semibold text-slate-800">
            {weekdayShort(getWeekday(swap.requester_date))}, {formatDayMonth(swap.requester_date)}
          </div>
        </div>
        <div className="border-l border-slate-200 pl-2.5">
          <span className="text-[10px] font-medium uppercase text-slate-400">
            Folga de {swap.target_name}
          </span>
          <div className="mt-0.5 font-semibold text-slate-800">
            {weekdayShort(getWeekday(swap.target_date))}, {formatDayMonth(swap.target_date)}
          </div>
        </div>
      </div>

      {swap.reason && (
        <p className="mt-2.5 text-xs text-slate-600">
          <span className="font-medium text-slate-400">Motivo:</span> {swap.reason}
        </p>
      )}

      {/* Dupla aprovação visual (quem já aprovou e quem falta) */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ApprovalPill label={`Colega (${swap.target_name})`} state={swap.target_status} />
        <ApprovalPill
          label="Administrador"
          state={swap.admin_status}
          detail={swap.admin_decided_by_name ?? undefined}
        />
      </div>

      <p className="mt-2.5 text-[11px] font-medium text-slate-500">{statusSummary}</p>

      {/* Botões de ação */}
      {(canActAsTarget || canActAsAdmin || canCancel) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {canActAsTarget && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => onRespond(swap, 'approved', 'target')}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {canActAsAdmin ? 'Aprovar como colega' : 'Aprovar troca'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onRespond(swap, 'rejected', 'target')}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Recusar
              </button>
            </>
          )}

          {canActAsAdmin && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => onRespond(swap, 'approved', 'admin')}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {canActAsTarget ? 'Aprovar como admin' : 'Aprovar (Admin)'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onRespond(swap, 'rejected', 'admin')}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Recusar
              </button>
            </>
          )}

          {canCancel && !canActAsTarget && !canActAsAdmin && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onRespond(swap, 'cancelled')}
              className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar solicitação
            </button>
          )}
        </div>
      )}
    </article>
  );
}
