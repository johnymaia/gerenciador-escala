import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getTodayBrazilYmd, getWeekday } from '../../shared/schedule';
import type { HolidayItem } from '../../shared/types';
import { Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { formatFullDateBr, weekdayShort } from '../lib/format';

export function HolidaysPage() {
  const [year, setYear] = useState(() => Number(getTodayBrazilYmd().slice(0, 4)));
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ date: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadHolidays = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listHolidays(year);
      setHolidays(res.holidays);
      setSuggestions(res.optional_suggestions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar feriados.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  async function handleToggleClosed(item: HolidayItem) {
    setSaving(true);
    try {
      await api.saveHoliday({
        date: item.date,
        name: item.name,
        is_closed: !item.is_closed,
      });
      await loadHolidays();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao alterar feriado.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCustom(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveHoliday({
        date: newDate,
        name: newName.trim() || 'Feriado / Loja Fechada',
        is_closed: true,
      });
      setModalOpen(false);
      setNewDate('');
      setNewName('');
      await loadHolidays();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao cadastrar feriado.');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickAdd(opt: { date: string; name: string }) {
    setSaving(true);
    try {
      await api.saveHoliday({ date: opt.date, name: opt.name, is_closed: true });
      await loadHolidays();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao adicionar data.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCustom(date: string) {
    setSaving(true);
    try {
      await api.deleteHoliday(date);
      await loadHolidays();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover feriado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-white px-2 py-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Ano anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-sm font-bold tabular-nums text-slate-900">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Próximo ano"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewDate(`${year}-01-01`);
            setNewName('');
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" />
          Cadastrar feriado
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Feriados nacionais e municipais de <strong>Belo Horizonte (MG)</strong> já vêm cadastrados.
        Quando a loja fecha no feriado, o rodízio pula automaticamente aquele dia e empurra a fila.
      </p>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Sugestões de ponto facultativo (Carnaval BH) */}
      {suggestions.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Pontos facultativos em BH (adicione se a loja fechar)
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((opt) => (
              <button
                key={opt.date}
                type="button"
                disabled={saving}
                onClick={() => handleQuickAdd(opt)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50/50"
              >
                <Plus className="h-3 w-3 text-teal-700" />
                {formatFullDateBr(opt.date).slice(0, 5)} — {opt.name.split(' (')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200/80 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          {holidays.map((h) => {
            const dow = getWeekday(h.date);
            const scopeBadge =
              h.scope === 'bh'
                ? 'BH'
                : h.scope === 'manual'
                  ? 'Manual'
                  : 'Nacional';

            return (
              <div
                key={h.date}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatFullDateBr(h.date).slice(0, 5)}
                    </span>
                    <span className="text-xs text-slate-400">({weekdayShort(dow)})</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        h.scope === 'bh'
                          ? 'bg-sky-50 text-sky-700'
                          : h.scope === 'manual'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {scopeBadge}
                    </span>
                  </div>
                  <div
                    className={`mt-0.5 truncate text-xs ${
                      h.is_closed ? 'text-slate-600' : 'text-slate-400 line-through'
                    }`}
                  >
                    {h.name}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleClosed(h)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      h.is_closed
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200/70'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {h.is_closed ? 'Fechada' : 'Aberta'}
                  </button>

                  {h.is_custom && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleDeleteCustom(h.date)}
                      aria-label="Remover feriado"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Cadastrar feriado manual"
        subtitle="O dia ficará marcado como loja fechada e o rodízio pulará essa data"
      >
        <form onSubmit={handleAddCustom} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Data</label>
            <input
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Nome / Descrição
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex.: Terça de Carnaval, Emenda..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar feriado
          </button>
        </form>
      </Modal>
    </div>
  );
}
