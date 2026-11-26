import {
  ArrowLeftRight,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Loader2,
  Palmtree,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDaysYmd } from '../../shared/holidays';
import {
  getMondayOfWeek,
  getMonthRange,
  getSundayOfWeek,
  getTodayBrazilYmd,
  getWeekday,
} from '../../shared/schedule';
import type { PublicEmployee, ScheduleDay } from '../../shared/types';
import { Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import {
  formatDayMonth,
  formatFullDateBr,
  formatMonthTitle,
  formatWeekRange,
  weekdayFull,
  weekdayShort,
} from '../lib/format';

interface TeamSchedulePageProps {
  user: PublicEmployee;
}

export function TeamSchedulePage({ user }: TeamSchedulePageProps) {
  const isAdmin = user.role === 'admin';
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [today, setToday] = useState(getTodayBrazilYmd());

  const [weekAnchor, setWeekAnchor] = useState(() => getMondayOfWeek(getTodayBrazilYmd()));
  const [monthKey, setMonthKey] = useState(() => getTodayBrazilYmd().slice(0, 7));

  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de detalhes do dia (para ambos perfis quando há troca; e edição completa para Admin)
  const [selectedDay, setSelectedDay] = useState<ScheduleDay | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapEmpA, setSwapEmpA] = useState<number>(0);
  const [swapDateA, setSwapDateA] = useState('');
  const [swapEmpB, setSwapEmpB] = useState<number>(0);
  const [swapDateB, setSwapDateB] = useState('');
  const [swapNote, setSwapNote] = useState('');
  const [holidayNameInput, setHolidayNameInput] = useState('');
  const [confirmUndoSwapId, setConfirmUndoSwapId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    if (viewMode === 'week') {
      return { from: weekAnchor, to: getSundayOfWeek(weekAnchor) };
    }
    const [y, m] = monthKey.split('-').map(Number);
    return getMonthRange(y, m);
  }, [viewMode, weekAnchor, monthKey]);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getSchedule(range.from, range.to);
      setDays(res.days);
      setEmployees(res.employees);
      setToday(res.today);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar escala.');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  function shiftPeriod(dir: -1 | 1) {
    if (viewMode === 'week') {
      setWeekAnchor((prev) => addDaysYmd(prev, dir * 7));
    } else {
      const [y, m] = monthKey.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + dir, 1));
      setMonthKey(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
  }

  function goToday() {
    const now = getTodayBrazilYmd();
    setWeekAnchor(getMondayOfWeek(now));
    setMonthKey(now.slice(0, 7));
  }

  async function handleToggleEmployeeOff(day: ScheduleDay, empId: number, currentStatus: string) {
    setSaving(true);
    try {
      const nextStatus = currentStatus === 'off' ? 'work' : 'off';
      await api.setScheduleOverride({
        date: day.date,
        employee_id: empId,
        status: nextStatus,
        note: 'Ajuste manual',
      });
      await loadSchedule();
      setSelectedDay(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao atualizar folga.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetDay(date: string) {
    setSaving(true);
    try {
      await api.clearScheduleOverride(date);
      await loadSchedule();
      setSelectedDay(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao restaurar dia.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUndoSwap(swapId: number) {
    setSaving(true);
    setError('');
    try {
      await api.respondSwapRequest(swapId, { decision: 'undo' });
      setConfirmUndoSwapId(null);
      setSelectedDay(null);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao desfazer troca.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRespondVacationInModal(
    vacationId: number,
    decision: 'approved' | 'rejected' | 'cancelled',
  ) {
    setSaving(true);
    setError('');
    try {
      await api.respondVacationRequest(vacationId, { decision });
      setSelectedDay(null);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao atualizar férias.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDayHoliday(day: ScheduleDay) {
    setSaving(true);
    try {
      if (day.holiday) {
        await api.saveHoliday({ date: day.date, name: day.holiday.name, is_closed: false });
      } else {
        await api.saveHoliday({
          date: day.date,
          name: holidayNameInput.trim() || 'Feriado / Loja Fechada',
          is_closed: true,
        });
      }
      setHolidayNameInput('');
      await loadSchedule();
      setSelectedDay(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao atualizar feriado.');
    } finally {
      setSaving(false);
    }
  }

  function openSwapModal() {
    const openDays = days.filter((d) => !d.is_sunday && !d.holiday && !d.is_before_start);
    const firstOffDay = openDays.find((d) => d.off_employee_ids.length > 0);
    const secondOffDay = openDays.find(
      (d) =>
        d.off_employee_ids.length > 0 &&
        d.date !== firstOffDay?.date &&
        d.off_employee_ids[0] !== firstOffDay?.off_employee_ids[0],
    );
    setSwapDateA(firstOffDay?.date || openDays[0]?.date || today);
    setSwapEmpA(firstOffDay?.off_employee_ids[0] || employees[0]?.id || 0);
    setSwapDateB(secondOffDay?.date || openDays[1]?.date || today);
    setSwapEmpB(secondOffDay?.off_employee_ids[0] || employees[1]?.id || 0);
    setSwapNote('');
    setSwapOpen(true);
  }

  async function handleSwapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.swapDaysOff({
        date_a: swapDateA,
        employee_a: swapEmpA,
        date_b: swapDateB,
        employee_b: swapEmpB,
        note: swapNote || 'Troca de folga',
      });
      setSwapOpen(false);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao trocar folgas.');
    } finally {
      setSaving(false);
    }
  }

  // Padding de células vazias no modo mensal (Segunda = coluna 0 ... Domingo = coluna 6)
  const monthLeadingEmpty = useMemo(() => {
    if (viewMode !== 'month' || days.length === 0) return 0;
    const firstDow = days[0].weekday; // 0=Dom, 1=Seg...
    return firstDow === 0 ? 6 : firstDow - 1;
  }, [viewMode, days]);

  const selectedDayOriginalOffName = useMemo(() => {
    if (!selectedDay || !selectedDay.base_off_employee_id) return null;
    return (
      selectedDay.employees.find((e) => e.employee_id === selectedDay.base_off_employee_id)?.name ??
      null
    );
  }, [selectedDay]);

  return (
    <div className="space-y-4">
      {/* Barra superior: modo Semana/Mês + navegação */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-200/80 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              viewMode === 'week'
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              viewMode === 'month'
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Mês
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <button
              type="button"
              onClick={openSwapModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 text-teal-700" />
              Trocar folga
            </button>
          )}
          <button
            type="button"
            onClick={goToday}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-2xs transition hover:bg-slate-50"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* Seletor de período */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-xs">
        <button
          type="button"
          onClick={() => shiftPeriod(-1)}
          aria-label="Período anterior"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900">
            {viewMode === 'week'
              ? formatWeekRange(range.from, range.to)
              : formatMonthTitle(monthKey)}
          </div>
          <div className="text-[11px] text-slate-400">
            {isAdmin
              ? 'Toque em um dia para ver trocas, editar ou marcar feriado'
              : 'Toque nos dias com selo de troca para ver os detalhes'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => shiftPeriod(1)}
          aria-label="Próximo período"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200/80 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
        </div>
      ) : viewMode === 'week' ? (
        /* VISÃO SEMANAL — Ultra limpa para celular */
        <div className="space-y-2">
          {days.map((day) => {
            const isToday = day.date === today;
            const offList = day.employees.filter((e) => e.status === 'off');
            const isMyOff = day.off_employee_ids.includes(user.id);
            const hasSwap = day.swaps.length > 0 || day.has_manual_change;
            const dayVacations = day.vacations ?? [];
            const hasVacation = dayVacations.length > 0;
            const hasApprovedVacation = dayVacations.some((v) => v.status === 'approved');
            const isOpenOff = Boolean(day.is_open_off);
            const hasCascade = Boolean(day.cascade_info);
            const canOpenDay =
              (!day.is_sunday && !day.is_before_start && isAdmin) ||
              hasSwap ||
              hasVacation ||
              hasCascade;

            return (
              <div
                key={day.date}
                onClick={() => canOpenDay && setSelectedDay(day)}
                className={`rounded-2xl border bg-white p-3.5 transition ${
                  canOpenDay ? 'cursor-pointer hover:border-teal-300' : ''
                } ${
                  isToday
                    ? 'border-teal-500 ring-1 ring-teal-500/20'
                    : day.is_before_start
                      ? 'border-slate-100 bg-slate-50/70 opacity-75'
                      : hasApprovedVacation
                        ? 'border-violet-200 bg-violet-50/25'
                        : hasVacation
                          ? 'border-dashed border-orange-300 bg-orange-50/25'
                          : hasSwap
                            ? 'border-sky-200 bg-sky-50/25'
                            : isMyOff
                              ? 'border-emerald-200 bg-emerald-50/30'
                              : day.holiday
                                ? 'border-amber-200 bg-amber-50/40'
                                : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Data e dia da semana */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center ${
                        isToday
                          ? 'bg-teal-700 text-white'
                          : day.is_sunday || day.is_before_start
                            ? 'bg-slate-100 text-slate-400'
                            : day.holiday
                              ? 'bg-amber-100 text-amber-800'
                              : hasApprovedVacation
                                ? 'bg-violet-100 text-violet-900'
                                : hasVacation
                                  ? 'bg-orange-100 text-orange-900'
                                  : hasSwap
                                    ? 'bg-sky-100 text-sky-800'
                                    : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="text-[10px] font-medium uppercase leading-none">
                        {weekdayShort(day.weekday)}
                      </span>
                      <span className="mt-0.5 text-sm font-bold leading-none tabular-nums">
                        {day.date.slice(8, 10)}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-900">
                          {weekdayFull(day.weekday)}
                        </span>
                        {isToday && (
                          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                            Hoje
                          </span>
                        )}
                        {hasSwap && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                            <ArrowLeftRight className="h-2.5 w-2.5" />
                            Troca
                          </span>
                        )}
                        {hasCascade && !isOpenOff && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                            ⤴ Remanejada (Férias Sáb)
                          </span>
                        )}
                        {dayVacations.map((vac) =>
                          vac.status === 'approved' ? (
                            <span
                              key={vac.id}
                              className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                            >
                              <Palmtree className="h-2.5 w-2.5" />
                              Férias • {vac.employee_name}
                            </span>
                          ) : (
                            <span
                              key={vac.id}
                              className="inline-flex items-center gap-1 rounded-full border border-dashed border-orange-400 bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-900"
                            >
                              <Clock className="h-2.5 w-2.5" />
                              Férias • {vac.employee_name} (Pendente)
                            </span>
                          ),
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {day.is_before_start
                          ? 'Antes do início da escala'
                          : day.is_sunday
                            ? 'Loja fechada • Folga geral'
                            : day.holiday
                              ? `Feriado • ${day.holiday.name}`
                              : `${day.employees.filter((e) => e.status === 'work').length} trabalhando`}
                      </div>
                    </div>
                  </div>

                  {/* Quem folga */}
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {day.is_before_start ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">
                        Sem escala
                      </span>
                    ) : day.is_sunday ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                        Domingo
                      </span>
                    ) : day.holiday ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        <Sparkles className="h-3 w-3" />
                        Feriado
                      </span>
                    ) : offList.length > 0 ? (
                      offList.map((emp) => {
                        const isMe = emp.employee_id === user.id;
                        return (
                          <span
                            key={emp.employee_id}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                              isMe
                                ? 'bg-teal-700 text-white'
                                : 'border border-emerald-200/80 bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: isMe ? '#ffffff' : emp.color }}
                            />
                            {emp.name}
                            {isMe && ' (Você)'}
                          </span>
                        );
                      })
                    ) : isOpenOff ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-teal-500 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-900">
                        <Sparkles className="h-3 w-3 text-teal-600" />
                        Folga Livre (Disponível)
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Ninguém de folga</span>
                    )}

                    {isAdmin && !day.is_sunday && !day.is_before_start && (
                      <Edit3 className="ml-0.5 h-3.5 w-3.5 text-slate-300" />
                    )}
                  </div>
                </div>

                {hasSwap && (
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-sky-100 pt-2 text-[11px] text-sky-700">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <ArrowLeftRight className="h-3 w-3 shrink-0" />
                      {day.swaps.length > 0
                        ? day.swaps[0].is_open_swap
                          ? `Folga Livre assumida por ${day.swaps[0].requester_name}`
                          : `Troca: ${day.swaps[0].requester_name} ⇄ ${day.swaps[0].target_name}`
                        : 'Houve alteração manual nesta data'}
                    </span>
                    <span className="shrink-0 font-semibold underline decoration-sky-300">
                      Ver detalhes
                    </span>
                  </div>
                )}

                {hasCascade && !hasSwap && (
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-teal-100 pt-2 text-[11px] text-teal-800">
                    <span className="truncate font-medium">{day.cascade_info}</span>
                    <span className="shrink-0 font-semibold underline decoration-teal-300">
                      Ver detalhes
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* VISÃO MENSAL — Calendário visual compacto */
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
          <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-slate-400">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((lbl) => (
              <div key={lbl} className="py-1">
                {lbl}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: monthLeadingEmpty }).map((_, idx) => (
              <div key={`empty-${idx}`} className="min-h-16 rounded-xl bg-slate-50/50" />
            ))}

            {days.map((day) => {
              const isToday = day.date === today;
              const isMyOff = day.off_employee_ids.includes(user.id);
              const offList = day.employees.filter((e) => e.status === 'off');
              const hasSwap = day.swaps.length > 0 || day.has_manual_change;
              const dayVacations = day.vacations ?? [];
              const hasVacation = dayVacations.length > 0;
              const hasApprovedVacation = dayVacations.some((v) => v.status === 'approved');
              const isOpenOff = Boolean(day.is_open_off);
              const hasCascade = Boolean(day.cascade_info);
              const canOpenDay =
                (!day.is_sunday && !day.is_before_start && isAdmin) ||
                hasSwap ||
                hasVacation ||
                hasCascade;

              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={!canOpenDay}
                  onClick={() => canOpenDay && setSelectedDay(day)}
                  className={`flex min-h-16 flex-col items-start rounded-xl border p-1.5 text-left transition ${
                    isToday
                      ? 'border-teal-600 ring-1 ring-teal-600/20'
                      : day.is_before_start
                        ? 'border-slate-100 bg-slate-50/70 text-slate-300'
                        : hasApprovedVacation
                          ? 'border-violet-300 bg-violet-50/40 hover:border-violet-400'
                          : hasVacation
                            ? 'border-dashed border-orange-300 bg-orange-50/40 hover:border-orange-400'
                            : hasSwap
                              ? 'border-sky-300 bg-sky-50/50 hover:border-sky-400'
                              : isMyOff
                                ? 'border-emerald-300 bg-emerald-50/70'
                                : day.holiday
                                  ? 'border-amber-200 bg-amber-50/70'
                                  : day.is_sunday
                                    ? 'border-slate-100 bg-slate-50 text-slate-400'
                                    : 'border-slate-100 bg-white hover:border-slate-300'
                  } ${canOpenDay ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex w-full items-center justify-between gap-0.5">
                    <span
                      className={`text-[11px] font-bold tabular-nums ${
                        isToday
                          ? 'flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-white'
                          : day.is_sunday || day.is_before_start
                            ? 'text-slate-400'
                            : 'text-slate-700'
                      }`}
                    >
                      {Number(day.date.slice(8, 10))}
                    </span>

                    <div className="flex items-center gap-0.5">
                      {hasVacation && (
                        <span
                          title={
                            hasApprovedVacation
                              ? 'Férias aprovadas neste dia — clique para ver'
                              : 'Férias aguardando aprovação — clique para ver'
                          }
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                            hasApprovedVacation
                              ? 'bg-violet-600 text-white'
                              : 'border border-dashed border-orange-500 bg-orange-200 text-orange-900'
                          }`}
                        >
                          <Palmtree className="h-2.5 w-2.5" />
                        </span>
                      )}
                      {hasSwap && (
                        <span
                          title="Houve troca neste dia — clique para ver"
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white"
                        >
                          <ArrowLeftRight className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 w-full space-y-0.5 overflow-hidden">
                    {day.is_before_start ? (
                      <span className="block text-[9px] text-slate-300">—</span>
                    ) : (
                      <>
                        {day.holiday ? (
                          <span className="block truncate rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-800">
                            Feriado
                          </span>
                        ) : day.is_sunday ? (
                          <span className="block text-[9px] text-slate-400">Dom</span>
                        ) : isOpenOff ? (
                          <span className="block truncate rounded border border-dashed border-teal-500 bg-teal-50 px-1 py-0.5 text-[9px] font-bold text-teal-900">
                            ✨ Livre
                          </span>
                        ) : (
                          offList.map((emp) => {
                            const isMe = emp.employee_id === user.id;
                            return (
                              <span
                                key={emp.employee_id}
                                className={`block truncate rounded px-1 py-0.5 text-[10px] font-semibold ${
                                  isMe
                                    ? 'bg-teal-700 text-white'
                                    : 'bg-emerald-100/80 text-emerald-900'
                                }`}
                              >
                                {emp.name.split(' ')[0]}
                              </span>
                            );
                          })
                        )}
                        {dayVacations.map((vac) => (
                          <span
                            key={`vac-${vac.id}`}
                            className={`block truncate rounded px-1 py-0.5 text-[9px] font-semibold ${
                              vac.status === 'approved'
                                ? 'bg-violet-600 text-white'
                                : 'border border-dashed border-orange-400 bg-orange-100 text-orange-900'
                            }`}
                          >
                            🏖️ {vac.employee_name.split(' ')[0]}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legenda limpa */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />
              Sua folga
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              Folga de colega
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
              Férias aprovadas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-orange-500 bg-orange-200" />
              Férias pendentes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-600 text-white">
                <ArrowLeftRight className="h-2 w-2" />
              </span>
              Teve troca (clique p/ ver)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              Feriado (loja fechada)
            </span>
          </div>
        </div>
      )}

      {/* Modal do Dia: Detalhes da Troca (ambos perfis) + Edição (somente Admin) */}
      <Modal
        open={Boolean(selectedDay)}
        onClose={() => {
          setConfirmUndoSwapId(null);
          setSelectedDay(null);
        }}
        title={
          selectedDay
            ? `${weekdayFull(selectedDay.weekday)}, ${formatFullDateBr(selectedDay.date)}`
            : ''
        }
        subtitle={
          isAdmin
            ? 'Detalhes de trocas e ajustes manuais deste dia'
            : 'Detalhes da troca de folga registrada nesta data'
        }
      >
        {selectedDay && (
          <div className="space-y-4">
            {/* Bloco explicativo do Remanejamento Automático de Sábado em Férias / Quinta Livre */}
            {selectedDay.cascade_info && (
              <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-3.5 text-xs text-teal-950">
                <div className="flex items-center gap-1.5 text-sm font-bold text-teal-900">
                  <Sparkles className="h-4 w-4 text-teal-700" />
                  {selectedDay.is_open_off
                    ? 'Folga Livre disponível nesta data'
                    : 'Folga remanejada automaticamente'}
                </div>
                <p className="mt-1.5 leading-relaxed text-teal-900">{selectedDay.cascade_info}</p>
                {selectedDay.is_open_off && (
                  <p className="mt-2 rounded-xl bg-white/90 p-2.5 text-[11px] font-medium text-teal-900">
                    💡 Para assumir esta Folga Livre, abra a aba <strong>Trocas → Pedir troca</strong> e
                    escolha a opção <strong>✨ Folga Livre</strong> (só precisa da aprovação do
                    administrador).
                  </p>
                )}
              </div>
            )}

            {/* Bloco visual de Férias neste dia (visível para TODOS) */}
            {(selectedDay.vacations ?? []).length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Férias neste dia
                </p>
                {selectedDay.vacations.map((vac) => {
                  const isApproved = vac.status === 'approved';
                  return (
                    <div
                      key={vac.id}
                      className={`rounded-2xl border p-3.5 text-xs ${
                        isApproved
                          ? 'border-violet-200 bg-violet-50/60 text-slate-700'
                          : 'border-dashed border-orange-300 bg-orange-50/60 text-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: vac.employee_color }}
                          />
                          <span>{vac.employee_name}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-teal-800">
                            {vac.days_count} {vac.days_count === 1 ? 'dia corrido' : 'dias corridos'}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isApproved
                              ? 'bg-violet-600 text-white'
                              : 'border border-dashed border-orange-400 bg-orange-100 text-orange-900'
                          }`}
                        >
                          {isApproved ? '🏖️ Férias aprovadas' : '⏳ Aguardando aprovação'}
                        </span>
                      </div>

                      <div className="mt-2 rounded-xl bg-white/90 p-2.5">
                        Período completo:{' '}
                        <strong className="text-slate-900">
                          {formatFullDateBr(vac.start_date)} até {formatFullDateBr(vac.end_date)}
                        </strong>
                      </div>

                      {vac.reason && (
                        <p className="mt-2 text-xs text-slate-600">
                          <span className="font-semibold text-slate-500">Observação:</span>{' '}
                          {vac.reason}
                        </p>
                      )}
                      {vac.approved_by_name && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Aprovado por <strong>{vac.approved_by_name}</strong>
                        </p>
                      )}

                      {isAdmin && vac.status === 'pending' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleRespondVacationInModal(vac.id, 'approved')}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Aprovar férias
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleRespondVacationInModal(vac.id, 'rejected')}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-white py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            Recusar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bloco visual de trocas registradas neste dia (visível para TODOS) */}
            {selectedDay.swaps.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Troca de folga neste dia
                </p>
                {selectedDay.swaps.map((sw) => {
                  const canUndoThisSwap =
                    isAdmin &&
                    sw.requester_date >= today &&
                    sw.target_date >= today;

                  return (
                    <div
                      key={sw.id}
                      className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs text-slate-700"
                    >
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: sw.requester_color }}
                        />
                        <span>{sw.requester_name}</span>
                        <ArrowLeftRight className="h-3.5 w-3.5 text-sky-600" />
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: sw.target_color }}
                        />
                        <span>{sw.target_name}</span>
                      </div>

                      <div className="mt-2.5 space-y-1.5 rounded-xl bg-white/90 p-2.5">
                        <div>
                          <strong className="text-slate-900">{sw.requester_name}</strong> passou a
                          folgar em{' '}
                          <strong className="text-teal-800">
                            {weekdayShort(getWeekday(sw.target_date))},{' '}
                            {formatDayMonth(sw.target_date)}
                            {sw.is_open_swap ? ' (Folga Livre)' : ''}
                          </strong>{' '}
                          <span className="text-slate-400">
                            (antes era {weekdayShort(getWeekday(sw.requester_date))},{' '}
                            {formatDayMonth(sw.requester_date)})
                          </span>
                        </div>
                        {!sw.is_open_swap && (
                          <div>
                            <strong className="text-slate-900">{sw.target_name}</strong> passou a
                            folgar em{' '}
                            <strong className="text-teal-800">
                              {weekdayShort(getWeekday(sw.requester_date))},{' '}
                              {formatDayMonth(sw.requester_date)}
                            </strong>{' '}
                            <span className="text-slate-400">
                              (antes era {weekdayShort(getWeekday(sw.target_date))},{' '}
                              {formatDayMonth(sw.target_date)})
                            </span>
                          </div>
                        )}
                      </div>

                      {sw.reason && (
                        <p className="mt-2 text-xs text-slate-600">
                          <span className="font-semibold text-slate-500">Motivo:</span> {sw.reason}
                        </p>
                      )}
                      {sw.approved_by_name && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Aprovado por <strong>{sw.approved_by_name}</strong>
                        </p>
                      )}

                      {canUndoThisSwap && confirmUndoSwapId !== sw.id && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setConfirmUndoSwapId(sw.id)}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Desfazer esta troca
                        </button>
                      )}

                      {canUndoThisSwap && confirmUndoSwapId === sw.id && (
                        <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                          <p className="text-[11px] font-medium text-amber-950">
                            Desfazer a troca entre <strong>{sw.requester_name}</strong> e{' '}
                            <strong>{sw.target_name}</strong>? As duas datas voltarão ao rodízio
                            original.
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmUndoSwapId(null)}
                              className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-600"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleUndoSwap(sw.id)}
                              className="flex-1 rounded-lg bg-amber-600 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              Confirmar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Caso seja uma alteração manual sem registro pareado em swap_requests */}
            {selectedDay.swaps.length === 0 && selectedDay.has_manual_change && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs text-slate-700">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-sky-900">
                  <ArrowLeftRight className="h-4 w-4 text-sky-600" />
                  Alteração manual neste dia
                </div>
                <div className="mt-2 space-y-1">
                  {selectedDayOriginalOffName && (
                    <p>
                      Folga original do rodízio:{' '}
                      <strong className="text-slate-900">{selectedDayOriginalOffName}</strong>
                    </p>
                  )}
                  <p>
                    Folga atual neste dia:{' '}
                    <strong className="text-teal-800">
                      {selectedDay.employees
                        .filter((e) => e.status === 'off')
                        .map((e) => e.name)
                        .join(', ') || 'Ninguém'}
                    </strong>
                  </p>
                  {selectedDay.employees.find((e) => e.is_override && e.note)?.note && (
                    <p className="text-slate-500">
                      Observação:{' '}
                      {selectedDay.employees.find((e) => e.is_override && e.note)?.note}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Controles de edição — SOMENTE para Administrador */}
            {isAdmin && (
              <>
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                      <CalendarIcon className="h-4 w-4 text-amber-600" />
                      {selectedDay.holiday ? selectedDay.holiday.name : 'Marcar como Feriado'}
                    </div>
                  </div>
                  {!selectedDay.holiday && (
                    <input
                      type="text"
                      value={holidayNameInput}
                      onChange={(e) => setHolidayNameInput(e.target.value)}
                      placeholder="Nome do feriado (ex.: Carnaval)"
                      className="mt-2 h-10 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm outline-none focus:border-amber-400"
                    />
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleDayHoliday(selectedDay)}
                    className="mt-2.5 w-full rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                  >
                    {selectedDay.holiday
                      ? 'Abrir loja neste dia (desmarcar feriado)'
                      : 'Marcar como Feriado (loja fechada)'}
                  </button>
                </div>

                {!selectedDay.holiday && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Equipe neste dia (toque para alternar)
                    </p>
                    <div className="space-y-1.5">
                      {selectedDay.employees.map((emp) => {
                        const isOff = emp.status === 'off';
                        const isOnVacation = emp.status === 'vacation';
                        return (
                          <button
                            key={emp.employee_id}
                            type="button"
                            disabled={saving || isOnVacation}
                            onClick={() =>
                              !isOnVacation &&
                              handleToggleEmployeeOff(selectedDay, emp.employee_id, emp.status)
                            }
                            className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
                              isOnVacation
                                ? 'cursor-default border-violet-200 bg-violet-50/40'
                                : 'border-slate-200/80 bg-white hover:bg-slate-50 disabled:opacity-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: emp.color }}
                              />
                              <span className="text-sm font-medium text-slate-900">{emp.name}</span>
                              {emp.is_override && !isOnVacation && (
                                <span className="text-[10px] text-slate-400">(manual)</span>
                              )}
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                isOnVacation
                                  ? 'bg-violet-600 text-white'
                                  : isOff
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isOnVacation ? '🏖️ Férias' : isOff ? 'Folga' : 'Trabalha'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedDay.has_manual_change && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleResetDay(selectedDay.date)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restaurar rodízio automático neste dia
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Admin: Trocar folga entre duas funcionárias */}
      <Modal
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        title="Trocar folga entre funcionárias"
        subtitle="Cada uma passa a folgar no dia da outra sem alterar o rodízio futuro"
      >
        <form onSubmit={handleSwapSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Funcionária 1</label>
              <select
                value={swapEmpA}
                onChange={(e) => setSwapEmpA(Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-sm"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Dia da folga atual
              </label>
              <input
                type="date"
                required
                value={swapDateA}
                onChange={(e) => setSwapDateA(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Funcionária 2</label>
              <select
                value={swapEmpB}
                onChange={(e) => setSwapEmpB(Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-sm"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Dia da folga atual
              </label>
              <input
                type="date"
                required
                value={swapDateB}
                onChange={(e) => setSwapDateB(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Observação (opcional)
            </label>
            <input
              type="text"
              value={swapNote}
              onChange={(e) => setSwapNote(e.target.value)}
              placeholder="Ex.: Troca combinada entre elas"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar troca
          </button>
        </form>
      </Modal>
    </div>
  );
}
