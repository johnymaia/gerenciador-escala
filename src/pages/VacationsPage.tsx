import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Palmtree,
  Plus,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDaysYmd, parseYmd } from '../../shared/holidays';
import { getTodayBrazilYmd, getWeekday } from '../../shared/schedule';
import type { PublicEmployee, VacationRequestItem } from '../../shared/types';
import { Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { formatFullDateBr, getInitials, weekdayShort } from '../lib/format';

interface VacationsPageProps {
  user: PublicEmployee;
  onPendingCountChange?: (count: number) => void;
}

function countInclusiveDays(startYmd: string, endYmd: string): number {
  if (!startYmd || !endYmd || startYmd > endYmd) return 0;
  const a = parseYmd(startYmd).getTime();
  const b = parseYmd(endYmd).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export function VacationsPage({ user, onPendingCountChange }: VacationsPageProps) {
  const isAdmin = user.role === 'admin';
  const [requests, setRequests] = useState<VacationRequestItem[]>([]);
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  // Filtros
  const [empFilter, setEmpFilter] = useState<'mine' | 'team'>('mine');
  const [adminFilter, setAdminFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Modal de novo agendamento de férias
  const [newOpen, setNewOpen] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number>(user.id);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadVacations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listVacations();
      setRequests(res.requests);
      setEmployees(res.employees);
      onPendingCountChange?.(res.pending_admin_count);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar férias.');
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    loadVacations();
  }, [loadVacations]);

  // Todas as férias ativas (pendentes ou aprovadas) que ocupam o calendário e bloqueiam conflitos
  const activeVacations = useMemo(
    () => requests.filter((r) => r.status === 'pending' || r.status === 'approved'),
    [requests],
  );

  const myRequests = useMemo(
    () => requests.filter((r) => r.employee_id === user.id),
    [requests, user.id],
  );

  const adminPendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests],
  );

  const adminApprovedCount = useMemo(
    () => requests.filter((r) => r.status === 'approved').length,
    [requests],
  );

  // Resumo anual de dias corridos por colaborador (padrão no ano atual, com opção de escolher anos passados)
  const currentYear = useMemo(() => getTodayBrazilYmd().slice(0, 4), []);
  const [selectedHistoryYear, setSelectedHistoryYear] = useState<string>(() =>
    getTodayBrazilYmd().slice(0, 4),
  );

  // Lista de anos disponíveis: ano atual + anos passados (últimos 4 anos + qualquer ano passado com registro)
  const availableHistoryYears = useMemo(() => {
    const curY = Number(currentYear);
    const yearsSet = new Set<string>();
    for (let y = curY; y >= curY - 4; y--) {
      yearsSet.add(String(y));
    }
    for (const req of requests) {
      const sy = req.start_date.slice(0, 4);
      const ey = req.end_date.slice(0, 4);
      if (sy <= currentYear) yearsSet.add(sy);
      if (ey <= currentYear) yearsSet.add(ey);
    }
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [currentYear, requests]);

  const annualEmployeeSummary = useMemo(() => {
    if (!isAdmin) return [];
    const today = getTodayBrazilYmd();
    const yearStart = `${selectedHistoryYear}-01-01`;
    const yearEnd = `${selectedHistoryYear}-12-31`;

    // Considera todos os colaboradores do rodízio + qualquer outro colaborador que tenha férias no ano selecionado
    const targetEmps = employees.filter(
      (emp) =>
        emp.in_rotation ||
        requests.some(
          (r) =>
            r.employee_id === emp.id &&
            (r.status === 'approved' || r.status === 'pending') &&
            r.start_date <= yearEnd &&
            r.end_date >= yearStart,
        ),
    );

    return targetEmps.map((emp) => {
      let concludedDays = 0;
      let scheduledDays = 0;
      let pendingDays = 0;
      let periodsCount = 0;

      for (const req of requests) {
        if (req.employee_id !== emp.id) continue;
        if (req.status !== 'approved' && req.status !== 'pending') continue;

        // Recorta o período estritamente dentro do ano selecionado (01/01 a 31/12)
        const clippedStart = req.start_date < yearStart ? yearStart : req.start_date;
        const clippedEnd = req.end_date > yearEnd ? yearEnd : req.end_date;
        if (clippedStart > clippedEnd) continue;

        const totalInYear = countInclusiveDays(clippedStart, clippedEnd);

        if (req.status === 'pending') {
          pendingDays += totalInYear;
        } else if (req.status === 'approved') {
          periodsCount++;
          if (clippedEnd <= today) {
            concludedDays += totalInYear;
          } else if (clippedStart > today) {
            scheduledDays += totalInYear;
          } else {
            // Férias em andamento hoje: dias até hoje entram como concluídos e de amanhã em diante como agendados
            const donePart = countInclusiveDays(clippedStart, today);
            concludedDays += donePart;
            scheduledDays += totalInYear - donePart;
          }
        }
      }

      return {
        employee: emp,
        concludedDays,
        scheduledDays,
        pendingDays,
        totalApprovedDays: concludedDays + scheduledDays,
        periodsCount,
      };
    });
  }, [isAdmin, selectedHistoryYear, employees, requests]);

  // Se for admin e não houver pendentes, mas houver aprovadas, mantém fácil visualização
  const visibleRequests = useMemo(() => {
    if (isAdmin) {
      if (adminFilter === 'all') return requests;
      if (adminFilter === 'rejected') {
        return requests.filter((r) => r.status === 'rejected' || r.status === 'cancelled');
      }
      return requests.filter((r) => r.status === adminFilter);
    }
    return empFilter === 'mine' ? myRequests : activeVacations;
  }, [isAdmin, adminFilter, empFilter, requests, myRequests, activeVacations]);

  // Cálculo em tempo real de dias corridos no modal
  const daysCount = useMemo(
    () => countInclusiveDays(startDate, endDate),
    [startDate, endDate],
  );

  // Verificação em tempo real de conflito com férias de qualquer colaborador (pending ou approved)
  const conflictingVacation = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return null;
    return (
      activeVacations.find(
        (v) => v.start_date <= endDate && v.end_date >= startDate,
      ) ?? null
    );
  }, [activeVacations, startDate, endDate]);

  function openNewVacationModal() {
    setError('');
    setReason('');
    const today = getTodayBrazilYmd();
    const defaultStart = addDaysYmd(today, 7);
    const defaultEnd = addDaysYmd(defaultStart, 14);
    setStartDate(defaultStart);
    setEndDate(defaultEnd);

    if (isAdmin) {
      const rotationEmps = employees.filter((e) => e.in_rotation);
      const firstEmp = rotationEmps[0] ?? employees[0];
      setSelectedEmpId(firstEmp ? firstEmp.id : user.id);
    } else {
      setSelectedEmpId(user.id);
    }

    setNewOpen(true);
  }

  async function handleCreateVacation(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || startDate > endDate || conflictingVacation) return;

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const res = await api.createVacationRequest({
        employee_id: isAdmin ? selectedEmpId : user.id,
        start_date: startDate,
        end_date: endDate,
        reason,
      });
      setNewOpen(false);
      if (isAdmin) {
        setAdminFilter('approved');
        setNotice(
          `Férias agendadas (${res.days_count} ${res.days_count === 1 ? 'dia corrido' : 'dias corridos'}) e já aprovadas automaticamente!`,
        );
      } else {
        setEmpFilter('mine');
        setNotice(
          `Solicitação de férias (${res.days_count} ${res.days_count === 1 ? 'dia corrido' : 'dias corridos'}) enviada! Ela já aparece no calendário como pendente até a aprovação do administrador.`,
        );
      }
      await loadVacations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao agendar férias.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespond(
    vacation: VacationRequestItem,
    decision: 'approved' | 'rejected' | 'cancelled',
  ) {
    setSavingId(vacation.id);
    setError('');
    setNotice('');
    try {
      const res = await api.respondVacationRequest(vacation.id, { decision });
      if (decision === 'approved') {
        setNotice(`Férias de ${vacation.employee_name} aprovadas com sucesso!`);
      } else if (decision === 'rejected') {
        setNotice(`Solicitação de férias de ${vacation.employee_name} recusada.`);
      } else {
        const extra =
          res.cancelled_open_swaps && res.cancelled_open_swaps > 0
            ? ` (${res.cancelled_open_swaps} ${
                res.cancelled_open_swaps === 1
                  ? 'troca de Folga Livre daquele período também foi cancelada'
                  : 'trocas de Folga Livre daquele período também foram canceladas'
              } automaticamente).`
            : '.';
        setNotice(`Agendamento de férias cancelado e liberado no calendário${extra}`);
      }
      await loadVacations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao atualizar férias.');
    } finally {
      setSavingId(null);
    }
  }

  const targetEmployeeName = useMemo(() => {
    if (!isAdmin) return user.name;
    return employees.find((e) => e.id === selectedEmpId)?.name ?? user.name;
  }, [isAdmin, employees, selectedEmpId, user.name]);

  return (
    <div className="space-y-4">
      {/* Cabeçalho de filtros e botão de agendar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isAdmin ? (
          <div className="inline-flex flex-wrap rounded-xl border border-slate-200/80 bg-white p-1 shadow-2xs">
            {(
              [
                { key: 'pending', label: 'Pendentes', count: adminPendingCount },
                { key: 'approved', label: 'Aprovadas', count: adminApprovedCount },
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
                        : f.key === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-violet-100 text-violet-800'
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
              onClick={() => setEmpFilter('mine')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                empFilter === 'mine'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Minhas férias ({myRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setEmpFilter('team')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                empFilter === 'team'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Calendário da equipe ({activeVacations.length})
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={openNewVacationModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" />
          {isAdmin ? 'Agendar férias' : 'Solicitar férias'}
        </button>
      </div>

      {/* Legenda rápida de cores */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs text-slate-600 shadow-2xs">
        <span className="font-medium text-slate-500">
          As férias agendadas aparecem imediatamente no calendário:
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-semibold text-violet-800">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
            Aprovada
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-orange-800">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-orange-600 bg-orange-200" />
            Aguardando aprovação
          </span>
        </div>
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
            <Palmtree className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            Nenhum registro de férias nesta aba
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {isAdmin
              ? 'Solicitações de férias pendentes ou agendamentos diretos aparecerão aqui.'
              : 'Use o botão "Solicitar férias" para escolher seu período de descanso.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map((item) => (
            <VacationCard
              key={item.id}
              vacation={item}
              currentUser={user}
              saving={savingId === item.id}
              onRespond={handleRespond}
            />
          ))}
        </div>
      )}

      {/* Histórico de Férias por colaborador (Visão exclusiva do Administrador, abaixo das solicitações) */}
      {isAdmin && !loading && annualEmployeeSummary.length > 0 && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Histórico de Férias
                </h3>
                <select
                  aria-label="Selecionar ano do histórico de férias"
                  value={selectedHistoryYear}
                  onChange={(e) => setSelectedHistoryYear(e.target.value)}
                  className="cursor-pointer rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-800 outline-none transition hover:border-teal-300 hover:bg-teal-100/70"
                >
                  {availableHistoryYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr === currentYear ? `Ano Atual (${yr})` : `Ano ${yr}`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Soma automática de dias concluídos e agendados dentro de {selectedHistoryYear}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Concluídos
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-violet-800">
                <span className="h-2 w-2 rounded-full bg-violet-600" />
                Agendados
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-orange-800">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                Pendentes
              </span>
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
            {annualEmployeeSummary.map((item) => (
              <div
                key={item.employee.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                    style={{ backgroundColor: item.employee.color }}
                  >
                    {getInitials(item.employee.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-slate-900">
                        {item.employee.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        •{' '}
                        {item.periodsCount === 0
                          ? `Nenhum período em ${selectedHistoryYear}`
                          : `${item.periodsCount} ${
                              item.periodsCount === 1 ? 'período' : 'períodos'
                            } em ${selectedHistoryYear}`}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          item.concludedDays > 0
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        ✓ {item.concludedDays}d concluídos
                      </span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          item.scheduledDays > 0
                            ? 'border border-violet-200 bg-violet-50 text-violet-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        📅 {item.scheduledDays}d agendados
                      </span>
                      {item.pendingDays > 0 && (
                        <span className="rounded-md border border-dashed border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">
                          ⏳ +{item.pendingDays}d pendentes
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div
                    className={`text-sm font-extrabold tabular-nums ${
                      item.totalApprovedDays > 0 ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {item.totalApprovedDays}{' '}
                    {item.totalApprovedDays === 1 ? 'dia' : 'dias'}
                    {item.pendingDays > 0 && (
                      <span className="ml-1 text-xs font-bold text-orange-600">
                        (+{item.pendingDays}d)
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-medium text-slate-400">
                    total corrido em {selectedHistoryYear}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal: Solicitar / Agendar Férias */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={isAdmin ? 'Agendar férias de colaborador' : 'Solicitar férias'}
        subtitle={
          isAdmin
            ? 'Agendamentos feitos pelo administrador já entram como aprovados imediatamente'
            : 'Sem limite de dias • Aparece no calendário e aguarda aprovação do administrador'
        }
      >
        <form onSubmit={handleCreateVacation} className="space-y-4">
          {isAdmin && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Colaboradora
              </label>
              <select
                required
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} (@{emp.username}){!emp.in_rotation ? ' • Fora do rodízio' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Data de início
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setStartDate(next);
                  if (endDate && next > endDate) {
                    setEndDate(next);
                  }
                }}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Data de término
              </label>
              <input
                type="date"
                required
                min={startDate || undefined}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Contador automático de dias corridos */}
          {daysCount > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-teal-200 bg-teal-50/70 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-teal-700 px-2 text-sm font-bold tabular-nums text-white">
                  {daysCount}
                </span>
                <div>
                  <div className="text-sm font-bold text-teal-950">
                    {daysCount} {daysCount === 1 ? 'dia corrido' : 'dias corridos'}
                  </div>
                  <div className="text-xs text-teal-800">
                    De {weekdayShort(getWeekday(startDate))}, {formatFullDateBr(startDate)} até{' '}
                    {weekdayShort(getWeekday(endDate))}, {formatFullDateBr(endDate)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {startDate && endDate && startDate > endDate && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              A data de término precisa ser igual ou posterior à data de início.
            </div>
          )}

          {/* Bloqueio imediato de conflito de férias */}
          {conflictingVacation && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div className="space-y-1">
                  <p className="font-bold text-rose-900">
                    Período indisponível — Conflito de Férias!
                  </p>
                  <p className="text-rose-800">
                    As datas escolhidas conflitam com as férias de{' '}
                    <strong>{conflictingVacation.employee_name}</strong> (
                    <strong>
                      {formatFullDateBr(conflictingVacation.start_date)} até{' '}
                      {formatFullDateBr(conflictingVacation.end_date)}
                    </strong>{' '}
                    •{' '}
                    {conflictingVacation.status === 'approved'
                      ? 'Aprovada'
                      : 'Aguardando aprovação'}
                    ).
                  </p>
                  <p className="text-rose-700">
                    Escolha outro período sem sobreposição de datas para continuar.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Lista compacta de períodos já ocupados para facilitar a escolha */}
          {activeVacations.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="mb-1.5 font-semibold text-slate-600">
                Períodos já reservados no calendário ({activeVacations.length}):
              </div>
              <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                {activeVacations.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-slate-700"
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: v.employee_color }}
                      />
                      {v.employee_name}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {formatFullDateBr(v.start_date)} a {formatFullDateBr(v.end_date)} (
                      {v.days_count}d • {v.status === 'approved' ? 'Aprovada' : 'Pendente'})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Observação / motivo (opcional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: Férias anuais, viagem em família..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {isAdmin ? (
              <span>
                As férias de <strong>{targetEmployeeName}</strong> serão salvas como{' '}
                <strong className="text-violet-700">Aprovadas</strong> sem precisar de outra
                aprovação.
              </span>
            ) : (
              <span>
                Status inicial:{' '}
                <strong className="text-orange-700">Aguardando aprovação do Administrador</strong>
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={
              submitting ||
              daysCount <= 0 ||
              Boolean(conflictingVacation)
            }
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isAdmin ? 'Agendar férias (Já aprovada)' : 'Enviar solicitação de férias'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function VacationCard({
  vacation,
  currentUser,
  saving,
  onRespond,
}: {
  vacation: VacationRequestItem;
  currentUser: PublicEmployee;
  saving: boolean;
  onRespond: (
    vacation: VacationRequestItem,
    decision: 'approved' | 'rejected' | 'cancelled',
  ) => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isAdmin = currentUser.role === 'admin';
  const isOwner = vacation.employee_id === currentUser.id;

  const canAdminDecide = isAdmin && vacation.status === 'pending';
  const canOwnerCancel = isOwner && vacation.status === 'pending';
  const canAdminCancelApproved = isAdmin && vacation.status === 'approved';

  let badgeLabel = '';
  let badgeClass = '';
  let cardBorderClass = 'border-slate-200/80 bg-white';
  let statusDescription = '';

  if (vacation.status === 'approved') {
    badgeLabel = '🏖️ Aprovada';
    badgeClass = 'bg-violet-600 text-white';
    cardBorderClass = 'border-violet-200 bg-white';
    statusDescription = vacation.admin_decided_by_name
      ? `Aprovada por ${vacation.admin_decided_by_name}`
      : 'Aprovada pelo administrador';
  } else if (vacation.status === 'pending') {
    badgeLabel = '⏳ Aguardando aprovação';
    badgeClass = 'border border-dashed border-orange-400 bg-orange-100 text-orange-900';
    cardBorderClass = 'border-dashed border-orange-300 bg-orange-50/20';
    statusDescription = 'Já visível no calendário • Falta aprovação de um administrador';
  } else if (vacation.status === 'rejected') {
    badgeLabel = 'Recusada';
    badgeClass = 'bg-rose-100 text-rose-700';
    statusDescription = vacation.admin_decided_by_name
      ? `Recusada por ${vacation.admin_decided_by_name}`
      : 'Recusada pelo administrador';
  } else {
    badgeLabel = 'Cancelada';
    badgeClass = 'bg-slate-100 text-slate-500';
    statusDescription = 'Agendamento cancelado';
  }

  return (
    <article className={`rounded-2xl border p-4 shadow-xs ${cardBorderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: vacation.employee_color }}
          />
          <span className="text-sm font-bold text-slate-900">
            {vacation.employee_name}
            {isOwner && (
              <span className="ml-1 text-xs font-normal text-slate-400">(Você)</span>
            )}
          </span>
          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-800">
            {vacation.days_count}{' '}
            {vacation.days_count === 1 ? 'dia corrido' : 'dias corridos'}
          </span>
        </div>

        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      {/* Período de início e fim */}
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200/70 bg-slate-50 p-2.5 text-xs">
        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-400">
            Início das férias
          </span>
          <div className="mt-0.5 font-bold text-slate-800">
            {weekdayShort(getWeekday(vacation.start_date))},{' '}
            {formatFullDateBr(vacation.start_date)}
          </div>
        </div>
        <div className="border-l border-slate-200 pl-2.5">
          <span className="text-[10px] font-semibold uppercase text-slate-400">
            Término das férias
          </span>
          <div className="mt-0.5 font-bold text-slate-800">
            {weekdayShort(getWeekday(vacation.end_date))},{' '}
            {formatFullDateBr(vacation.end_date)}
          </div>
        </div>
      </div>

      {vacation.reason && (
        <p className="mt-2.5 text-xs text-slate-600">
          <span className="font-medium text-slate-400">Observação:</span> {vacation.reason}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        {vacation.status === 'approved' ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-violet-600" />
        ) : vacation.status === 'pending' ? (
          <Clock className="h-3.5 w-3.5 text-orange-600" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-slate-400" />
        )}
        <span>{statusDescription}</span>
      </div>

      {/* Ações */}
      {(canAdminDecide || canOwnerCancel || canAdminCancelApproved) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {canAdminDecide && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => onRespond(vacation, 'approved')}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Aprovar férias
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onRespond(vacation, 'rejected')}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Recusar
              </button>
            </>
          )}

          {canOwnerCancel && !canAdminDecide && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onRespond(vacation, 'cancelled')}
              className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar minha solicitação
            </button>
          )}

          {canAdminCancelApproved && !confirmCancel && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirmCancel(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Cancelar férias aprovadas
            </button>
          )}

          {canAdminCancelApproved && confirmCancel && (
            <div className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-[11px] font-medium text-amber-950">
                Cancelar as férias de <strong>{vacation.employee_name}</strong> (
                {formatFullDateBr(vacation.start_date)} a {formatFullDateBr(vacation.end_date)})?
              </p>
              <p className="text-[11px] text-amber-900">
                ⚠️ Como as férias serão canceladas, {vacation.employee_name} voltará às suas folgas
                normais do rodízio e <strong>qualquer solicitação ou troca de Folga Livre</strong>{' '}
                gerada neste período também será <strong>cancelada automaticamente</strong>.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-600"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setConfirmCancel(false);
                    onRespond(vacation, 'cancelled');
                  }}
                  className="flex-1 rounded-lg bg-amber-600 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Confirmar cancelamento
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
