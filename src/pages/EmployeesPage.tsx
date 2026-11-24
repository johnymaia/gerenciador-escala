import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Loader2,
  Plus,
  Settings,
  Shield,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { PublicEmployee, ShopSettings, UserRole } from '../../shared/types';
import { Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';

const COLOR_OPTIONS = [
  '#0F766E',
  '#0284C7',
  '#7C3AED',
  '#DB2777',
  '#D97706',
  '#059669',
  '#2563EB',
  '#E11D48',
];

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface EmployeesPageProps {
  currentUser: PublicEmployee;
  settings: ShopSettings;
  onSettingsUpdated: (s: ShopSettings) => void;
}

export function EmployeesPage({
  currentUser,
  settings,
  onSettingsUpdated,
}: EmployeesPageProps) {
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal de cadastro/edição
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PublicEmployee | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [inRotation, setInRotation] = useState(true);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [active, setActive] = useState(true);

  // Modal de configurações da loja
  const [configOpen, setConfigOpen] = useState(false);
  const [shopName, setShopName] = useState(settings.shop_name);
  const [openTime, setOpenTime] = useState(settings.open_time);
  const [closeTime, setCloseTime] = useState(settings.close_time);
  const [lunchHours, setLunchHours] = useState(String(settings.lunch_hours));
  const [dailyHours, setDailyHours] = useState(String(settings.daily_hours));
  const [anchorDate, setAnchorDate] = useState(settings.rotation_start_date);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listEmployees();
      setEmployees(res.employees);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar funcionários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const rotationList = employees
    .filter((e) => e.active && e.in_rotation)
    .sort((a, b) => a.rotation_order - b.rotation_order || a.id - b.id);

  const otherUsers = employees.filter((e) => !e.active || !e.in_rotation);

  function openNewModal() {
    setEditing(null);
    setName('');
    setUsername('');
    setPassword('');
    setRole('employee');
    setInRotation(true);
    setColor(COLOR_OPTIONS[employees.length % COLOR_OPTIONS.length]);
    setActive(true);
    setFormOpen(true);
  }

  function openEditModal(emp: PublicEmployee) {
    setEditing(emp);
    setName(emp.name);
    setUsername(emp.username);
    setPassword('');
    setRole(emp.role);
    setInRotation(emp.in_rotation);
    setColor(emp.color);
    setActive(emp.active);
    setFormOpen(true);
  }

  async function handleSaveEmployee(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.updateEmployee(editing.id, {
          name,
          username,
          ...(password.trim() ? { password } : {}),
          role,
          in_rotation: inRotation,
          color,
          active,
        });
      } else {
        await api.createEmployee({
          name,
          username,
          password,
          role,
          in_rotation: inRotation,
          color,
        });
      }
      setFormOpen(false);
      await loadEmployees();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar funcionário.');
    } finally {
      setSaving(false);
    }
  }

  async function moveRotation(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rotationList.length) return;
    const reordered = [...rotationList];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    setSaving(true);
    try {
      await api.updateConfig({
        rotation_orders: reordered.map((emp, idx) => ({
          id: emp.id,
          rotation_order: idx + 1,
        })),
      });
      await loadEmployees();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao reordenar rodízio.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.updateConfig({
        shop_name: shopName,
        open_time: openTime,
        close_time: closeTime,
        lunch_hours: Number(lunchHours),
        daily_hours: Number(dailyHours),
        rotation_start_date: anchorDate,
      });
      onSettingsUpdated(res.settings);
      setConfigOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setShopName(settings.shop_name);
            setOpenTime(settings.open_time);
            setCloseTime(settings.close_time);
            setLunchHours(String(settings.lunch_hours));
            setDailyHours(String(settings.daily_hours));
            setAnchorDate(settings.rotation_start_date);
            setConfigOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
        >
          <Settings className="h-4 w-4 text-slate-500" />
          Configurar lotérica
        </button>

        <button
          type="button"
          onClick={openNewModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" />
          Novo funcionário
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200/80 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
        </div>
      ) : (
        <>
          {/* Lista do Rodízio */}
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Ordem do Rodízio ({rotationList.length})
              </h3>
              <p className="text-xs text-slate-400">
                Define quem folga em cada dia da semana base (use as setas para reordenar)
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {rotationList.map((emp, idx) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                      style={{ backgroundColor: emp.color }}
                    >
                      {WEEKDAY_LABELS[idx % 6]}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {emp.name}
                        </span>
                        {emp.role === 'admin' && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                            <Shield className="h-2.5 w-2.5" />
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">@{emp.username}</div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={saving || idx === 0}
                      onClick={() => moveRotation(idx, -1)}
                      aria-label="Subir posição"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={saving || idx === rotationList.length - 1}
                      onClick={() => moveRotation(idx, 1)}
                      aria-label="Descer posição"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(emp)}
                      aria-label="Editar"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-teal-700"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Outros usuários (Admins fora do rodízio ou desativados) */}
          {otherUsers.length > 0 && (
            <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Outros acessos / Inativos
                </h3>
              </div>
              <div className="divide-y divide-slate-100">
                {otherUsers.map((emp) => (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        {emp.active ? (
                          <UserCheck className="h-4 w-4" />
                        ) : (
                          <UserX className="h-4 w-4 text-slate-400" />
                        )}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-sm font-semibold ${
                              emp.active ? 'text-slate-900' : 'text-slate-400 line-through'
                            }`}
                          >
                            {emp.name}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {emp.role === 'admin' ? 'Admin' : 'Funcionário'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">
                          @{emp.username} {!emp.active && '• Desativado'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openEditModal(emp)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-teal-700"
                      aria-label="Editar"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Modal Cadastro / Edição de Funcionário */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Editar — ${editing.name}` : 'Cadastrar funcionário'}
        subtitle="Defina usuário, senha e perfil de acesso"
      >
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nome</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Maria"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Usuário (login)
              </label>
              <input
                type="text"
                required
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex.: maria"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {editing ? 'Nova senha (opcional)' : 'Senha inicial'}
              </label>
              <input
                type="password"
                required={!editing}
                minLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? 'Manter atual' : 'Mín. 4 dígitos'}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Perfil</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('employee')}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                  role === 'employee'
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Funcionário
                <span className="mt-0.5 block font-normal opacity-75">Só visualiza</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                  role === 'admin'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Administrador
                <span className="mt-0.5 block font-normal opacity-75">Pode alterar tudo</span>
              </button>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
            <div>
              <div className="text-xs font-semibold text-slate-800">Participa do rodízio</div>
              <div className="text-[11px] text-slate-500">
                Desmarque para donos/gerentes que não entram na escala das 6 folgas
              </div>
            </div>
            <input
              type="checkbox"
              checked={inRotation}
              onChange={(e) => setInRotation(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
          </label>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Cor de identificação
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition ${
                    color === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          {editing && editing.id !== currentUser.id && (
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5">
              <span className="text-xs font-semibold text-slate-700">Conta ativa</span>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Salvar alterações' : 'Cadastrar'}
          </button>
        </form>
      </Modal>

      {/* Modal Configurações da Lotérica */}
      <Modal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Configurações da lotérica"
        subtitle="Horário de funcionamento, jornada diária e semana base do rodízio"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nome da loja</label>
            <input
              type="text"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Abertura</label>
              <input
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Fechamento</label>
              <input
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Almoço (horas)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={lunchHours}
                onChange={(e) => setLunchHours(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Horas/dia trabalhadas
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                value={dailyHours}
                onChange={(e) => setDailyHours(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Semana base do rodízio (Segunda-feira)
            </label>
            <input
              type="date"
              required
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Nesta semana, a 1ª funcionária da lista folga na Segunda, a 2ª na Terça, e assim por diante.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar configurações
          </button>
        </form>
      </Modal>
    </div>
  );
}
