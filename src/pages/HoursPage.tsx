import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { addDaysYmd } from '../../shared/holidays';
import { getMondayOfWeek, getTodayBrazilYmd } from '../../shared/schedule';
import type { EmployeeHoursReport, PublicEmployee } from '../../shared/types';
import { Modal } from '../components/Modal';
import { api, ApiError, type HoursResponse } from '../lib/api';
import {
  formatDayMonth,
  formatHours,
  formatMonthTitle,
  formatWeekRange,
  weekdayShort,
} from '../lib/format';

interface HoursPageProps {
  user: PublicEmployee;
}

export function HoursPage({ user }: HoursPageProps) {
  const isAdmin = user.role === 'admin';
  const [weekDate, setWeekDate] = useState(() => getMondayOfWeek(getTodayBrazilYmd()));
  const [monthKey, setMonthKey] = useState(() => getTodayBrazilYmd().slice(0, 7));

  const [data, setData] = useState<HoursResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedReport, setSelectedReport] = useState<EmployeeHoursReport | null>(null);
  const [detailScope, setDetailScope] = useState<'week' | 'month'>('month');

  // Modal de ajuste manual de horas (Admin)
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjEmpId, setAdjEmpId] = useState<number>(0);
  const [adjDate, setAdjDate] = useState(() => getTodayBrazilYmd());
  const [adjHours, setAdjHours] = useState('-8');
  const [adjReason, setAdjReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadHours = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getHours(weekDate, monthKey);
      setData(res);
      setSelectedReport((prev) =>
        prev ? res.reports.find((r) => r.employee.id === prev.employee.id) ?? null : null,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar horas.');
    } finally {
      setLoading(false);
    }
  }, [weekDate, monthKey]);

  useEffect(() => {
    loadHours();
  }, [loadHours]);

  function shiftWeek(dir: -1 | 1) {
    setWeekDate((prev) => addDaysYmd(prev, dir * 7));
  }

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + dir, 1));
    setMonthKey(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  function openAdjustmentModal(empId?: number) {
    const firstId = empId || data?.reports[0]?.employee.id || 0;
    setAdjEmpId(firstId);
    setAdjDate(getTodayBrazilYmd());
    setAdjHours('-8');
    setAdjReason('');
    setAdjOpen(true);
  }

  async function handleAddAdjustment(e: React.FormEvent) {
    e.preventDefault();
    const delta = Number(adjHours.replace(',', '.'));
    if (!Number.isFinite(delta) || delta === 0) {
      setError('Informe um valor de horas diferente de zero (ex.: -8 ou +2).');
      return;
    }
    setSaving(true);
    try {
      await api.addHourAdjustment({
        employee_id: adjEmpId,
        date: adjDate,
        hours_delta: delta,
        reason: adjReason,
      });
      setAdjOpen(false);
      await loadHours();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao lançar ajuste.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAdjustment(id: number) {
    setSaving(true);
    try {
      await api.deleteHourAdjustment(id);
      await loadHours();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover ajuste.');
    } finally {
      setSaving(false);
    }
  }

  const singleEmployeeReport = !isAdmin ? data?.reports[0] ?? null : null;

  return (
    <div className="space-y-4">
      {/* Controles de Semana e Mês */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-2.5 py-2 shadow-xs">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Semana
            </div>
            <div className="text-xs font-semibold text-slate-800">
              {data ? formatWeekRange(data.week.from, data.week.to) : '...'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-2.5 py-2 shadow-xs">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Mês
            </div>
            <div className="text-xs font-semibold text-slate-800">
              {formatMonthTitle(monthKey)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
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
      ) : isAdmin ? (
        /* VISÃO ADMINISTRADOR: Todas as funcionárias */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Jornada padrão: <span className="font-semibold text-slate-700">{data?.daily_hours ?? 8}h/dia</span> (10h–19h com 1h almoço)
            </p>
            <button
              type="button"
              onClick={() => openAdjustmentModal()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Lançar ajuste
            </button>
          </div>

          <div className="space-y-2">
            {data?.reports.map((report) => (
              <button
                key={report.employee.id}
                type="button"
                onClick={() => {
                  setSelectedReport(report);
                  setDetailScope('month');
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition hover:border-teal-300"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-white"
                    style={{ backgroundColor: report.employee.color }}
                  >
                    {report.employee.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {report.employee.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {report.month.worked_days} dias trab. no mês • {report.month.off_days} folgas
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right tabular-nums">
                  <div>
                    <div className="text-[10px] font-medium uppercase text-slate-400">Semana</div>
                    <div className="text-sm font-bold text-slate-900">
                      {formatHours(report.week.total_hours)}
                    </div>
                  </div>
                  <div className="border-l border-slate-100 pl-4">
                    <div className="text-[10px] font-medium uppercase text-slate-400">Mês</div>
                    <div className="text-base font-bold text-teal-700">
                      {formatHours(report.month.total_hours)}
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {data?.reports.length === 0 && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center text-sm text-slate-400">
                Nenhuma funcionária ativa no rodízio.
              </div>
            )}
          </div>
        </div>
      ) : singleEmployeeReport ? (
        /* VISÃO FUNCIONÁRIA: Somente as próprias horas */
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Horas na semana
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {formatHours(singleEmployeeReport.week.total_hours)}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {singleEmployeeReport.week.worked_days} dias trabalhados
              </div>
            </div>

            <div className="rounded-2xl border border-teal-200/80 bg-teal-50/40 p-4 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
                <Clock className="h-3.5 w-3.5 text-teal-600" />
                Horas no mês
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-teal-800">
                {formatHours(singleEmployeeReport.month.total_hours)}
              </div>
              <div className="mt-1 text-xs text-teal-700/75">
                {singleEmployeeReport.month.worked_days} dias • {singleEmployeeReport.month.off_days} folgas
              </div>
            </div>
          </div>

          <HoursDayList
            report={singleEmployeeReport}
            scope={detailScope}
            onScopeChange={setDetailScope}
            isAdmin={false}
          />
        </div>
      ) : null}

      {/* Modal de detalhamento (Admin) */}
      <Modal
        open={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        title={selectedReport ? `Horas — ${selectedReport.employee.name}` : ''}
        subtitle={
          selectedReport
            ? `Semana: ${formatHours(selectedReport.week.total_hours)} • Mês: ${formatHours(selectedReport.month.total_hours)}`
            : ''
        }
      >
        {selectedReport && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => openAdjustmentModal(selectedReport.employee.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 py-2.5 text-xs font-semibold text-white hover:bg-teal-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Lançar falta / hora extra para {selectedReport.employee.name}
            </button>

            <HoursDayList
              report={selectedReport}
              scope={detailScope}
              onScopeChange={setDetailScope}
              isAdmin={true}
              onDeleteAdjustment={handleDeleteAdjustment}
            />
          </div>
        )}
      </Modal>

      {/* Modal Admin: Novo ajuste de horas */}
      <Modal
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        title="Lançar ajuste de horas"
        subtitle="Use valores negativos para falta/saída cedo e positivos para hora extra"
      >
        <form onSubmit={handleAddAdjustment} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Funcionária</label>
            <select
              value={adjEmpId}
              onChange={(e) => setAdjEmpId(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            >
              {data?.reports.map((r) => (
                <option key={r.employee.id} value={r.employee.id}>
                  {r.employee.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Data</label>
              <input
                type="date"
                required
                value={adjDate}
                onChange={(e) => setAdjDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Horas (ex.: -8 ou +2)
              </label>
              <input
                type="number"
                step="0.5"
                required
                value={adjHours}
                onChange={(e) => setAdjHours(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>
          </div>

          {/* Atalhos rápidos */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Falta (-8h)', v: '-8', r: 'Falta' },
              { label: 'Meio período (-4h)', v: '-4', r: 'Meio período' },
              { label: 'Atestado (-8h)', v: '-8', r: 'Atestado médico' },
              { label: 'Extra (+2h)', v: '2', r: 'Hora extra' },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setAdjHours(preset.v);
                  setAdjReason(preset.r);
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Motivo / observação
            </label>
            <input
              type="text"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Ex.: Atestado, hora extra, atraso..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar ajuste
          </button>
        </form>
      </Modal>
    </div>
  );
}

function HoursDayList({
  report,
  scope,
  onScopeChange,
  isAdmin,
  onDeleteAdjustment,
}: {
  report: EmployeeHoursReport;
  scope: 'week' | 'month';
  onScopeChange: (s: 'week' | 'month') => void;
  isAdmin: boolean;
  onDeleteAdjustment?: (id: number) => void;
}) {
  const period = scope === 'week' ? report.week : report.month;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Detalhamento diário
        </span>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onScopeChange('week')}
            className={`rounded-md px-2.5 py-1 font-medium ${
              scope === 'week' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => onScopeChange('month')}
            className={`rounded-md px-2.5 py-1 font-medium ${
              scope === 'month' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
            }`}
          >
            Mês
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {period.days.map((d) => {
          const statusLabel =
            d.status === 'before_start'
              ? 'Antes da escala'
              : d.status === 'work'
                ? 'Trabalho'
                : d.status === 'off'
                  ? 'Folga'
                  : d.status === 'holiday'
                    ? `Feriado${d.holiday_name ? ` • ${d.holiday_name}` : ''}`
                    : 'Domingo';

          return (
            <div key={d.date} className="py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {formatDayMonth(d.date)}
                  </span>
                  <span className="ml-1.5 text-xs text-slate-400">
                    {weekdayShort(d.weekday)}
                  </span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      d.status === 'off'
                        ? 'bg-emerald-50 text-emerald-700'
                        : d.status === 'holiday'
                          ? 'bg-amber-50 text-amber-800'
                          : d.status === 'sunday'
                            ? 'bg-slate-100 text-slate-400'
                            : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatHours(d.total_hours)}
                </span>
              </div>

              {d.adjustments.length > 0 && (
                <div className="mt-1.5 space-y-1 pl-2">
                  {d.adjustments.map((adj) => (
                    <div
                      key={adj.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                    >
                      <span>
                        <strong className={adj.hours_delta < 0 ? 'text-rose-600' : 'text-teal-700'}>
                          {adj.hours_delta > 0 ? `+${adj.hours_delta}h` : `${adj.hours_delta}h`}
                        </strong>{' '}
                        {adj.reason && `— ${adj.reason}`}
                      </span>
                      {isAdmin && onDeleteAdjustment && (
                        <button
                          type="button"
                          onClick={() => onDeleteAdjustment(adj.id)}
                          aria-label="Remover ajuste"
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
