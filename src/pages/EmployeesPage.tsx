import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Edit3,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  Settings,
  Shield,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_USER_PASSWORD,
  type PublicEmployee,
  type ShopSettings,
  type UserRole,
} from '../../shared/types';
import { Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { formatFullDateBr } from '../lib/format';

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
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal de Data de Início do Cálculo da Escala
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [newStartDate, setNewStartDate] = useState(settings.rotation_start_date);

  // Modal de cadastro/edição
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PublicEmployee | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [inRotation, setInRotation] = useState(true);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [active, setActive] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

  // Modal de configurações gerais da loja
  const [configOpen, setConfigOpen] = useState(false);
  const [shopName, setShopName] = useState(settings.shop_name);
  const [openTime, setOpenTime] = useState(settings.open_time);
  const [closeTime, setCloseTime] = useState(settings.close_time);
  const [lunchHours, setLunchHours] = useState(String(settings.lunch_hours));
  const [dailyHours, setDailyHours] = useState(String(settings.daily_hours));

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
    setRole('employee');
    setInRotation(true);
    setColor(COLOR_OPTIONS[employees.length % COLOR_OPTIONS.length]);
    setActive(true);
    setConfirmReset(false);
    setFormOpen(true);
  }

  function openEditModal(emp: PublicEmployee) {
    setEditing(emp);
    setName(emp.name);
    setUsername(emp.username);
    setRole(emp.role);
    setInRotation(emp.in_rotation);
    setColor(emp.color);
    setActive(emp.active);
    setConfirmReset(false);
    setFormOpen(true);
  }

  async function handleSaveEmployee(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editing) {
        await api.updateEmployee(editing.id, {
          name,
          username,
          role,
          in_rotation: inRotation,
          color,
          active,
        });
        setNotice(`Dados de ${name} atualizados.`);
      } else {
        const created = await api.createEmployee({
          name,
          username,
          role,
          in_rotation: inRotation,
          color,
        });
        setNotice(
          `Usuário @${created.username} cadastrado com a senha inicial padrão ${DEFAULT_USER_PASSWORD}. No primeiro acesso ele será obrigado a trocar.`,
        );
      }
      setFormOpen(false);
      await loadEmployees();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar funcionário.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(emp: PublicEmployee) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.updateEmployee(emp.id, { reset_password: true });
      setConfirmReset(false);
      setFormOpen(false);
      setNotice(
        `Senha de ${emp.name} (@${emp.username}) resetada para ${DEFAULT_USER_PASSWORD}. No próximo login será obrigatório cadastrar uma nova senha.`,
      );
      await loadEmployees();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao resetar senha.');
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

  async function handleSaveStartDate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await api.updateConfig({
        rotation_start_date: newStartDate,
      });
      onSettingsUpdated(res.settings);
      setStartDateOpen(false);
      setNotice(
        `Data de início do rodízio atualizada para ${formatFullDateBr(res.settings.rotation_start_date)}. Toda a escala passou a ser calculada a partir deste dia.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao atualizar data de início.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await api.updateConfig({
        shop_name: shopName,
        open_time: openTime,
        close_time: closeTime,
        lunch_hours: Number(lunchHours),
        daily_hours: Number(dailyHours),
      });
      onSettingsUpdated(res.settings);
      setConfigOpen(false);
      setNotice('Configurações da lotérica atualizadas.');
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

      {/* Card em destaque: Data de início do cálculo da escala */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Data de início do cálculo da escala
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                O rodízio começa a contar somente a partir de{' '}
                <strong className="font-semibold text-slate-900 tabular-nums">
                  {formatFullDateBr(settings.rotation_start_date)}
                </strong>{' '}
                (1º dia da fila).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewStartDate(settings.rotation_start_date);
              setStartDateOpen(true);
            }}
            className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
          >
            Alterar data
          </button>
        </div>
      </section>

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
                A 1ª pessoa da fila folga no 1º dia útil a partir de{' '}
                {formatFullDateBr(settings.rotation_start_date)}, a 2ª no dia seguinte, e assim por diante.
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
                      {idx + 1}º
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {emp.name}
                        </span>
                        {emp.role === 'admin' && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                            <Shield className="h-2.5 w-2.5" />
                            Admin
                          </span>
                        )}
                        {emp.must_change_password && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Senha padrão
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
                        <div className="flex flex-wrap items-center gap-1.5">
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
                          {emp.must_change_password && emp.active && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Senha padrão
                            </span>
                          )}
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

      {/* Modal: Alterar Data de Início do Cálculo da Escala */}
      <Modal
        open={startDateOpen}
        onClose={() => setStartDateOpen(false)}
        title="Data de início do cálculo da escala"
        subtitle="Define o 1º dia oficial do rodízio da equipe"
      >
        <form onSubmit={handleSaveStartDate} className="space-y-4">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="space-y-1.5 text-xs leading-relaxed">
                <p className="font-semibold text-amber-950">
                  Atenção: esta alteração impacta todo o rodízio!
                </p>
                <p>
                  A escala <strong>só começa a ser calculada usando esta data como o 1º dia</strong>:
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    A 1ª funcionária da lista folgará no 1º dia útil a partir dessa data, recalculando
                    todas as semanas seguintes.
                  </li>
                  <li>
                    Datas anteriores a esse dia ficarão sem escala e não entram na contagem de horas.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Primeiro dia do rodízio
            </label>
            <input
              type="date"
              required
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStartDateOpen(false)}
              className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar data
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Cadastro / Edição de Funcionário */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Editar — ${editing.name}` : 'Cadastrar funcionário'}
        subtitle={
          editing
            ? 'Altere dados cadastrais, perfil ou resete a senha para o padrão'
            : 'Defina nome, usuário e perfil de acesso'
        }
      >
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          {/* Aviso claro da senha padrão ao cadastrar novo usuário */}
          {!editing && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-teal-200 bg-teal-50/70 p-3.5 text-xs text-teal-900">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              <div>
                <p className="font-semibold">
                  Senha inicial padrão:{' '}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-teal-800">
                    {DEFAULT_USER_PASSWORD}
                  </code>
                </p>
                <p className="mt-0.5 text-teal-800/80">
                  Todo novo usuário é criado com esta senha e será obrigado a criar uma senha
                  pessoal logo no primeiro login.
                </p>
              </div>
            </div>
          )}

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

          {/* Resetar senha (única ação permitida ao admin — nunca ver nem definir senha) */}
          {editing && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Senha de acesso</div>
                  <div className="text-[11px] text-slate-500">
                    Por segurança, a senha pessoal não fica visível. Você pode apenas resetar para{' '}
                    <strong>{DEFAULT_USER_PASSWORD}</strong>.
                  </div>
                </div>
              </div>

              {!confirmReset ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmReset(true)}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Resetar senha para {DEFAULT_USER_PASSWORD}
                </button>
              ) : (
                <div className="mt-2.5 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-[11px] font-medium text-amber-900">
                    Confirmar reset da senha de <strong>{editing.name}</strong> para{' '}
                    <strong>{DEFAULT_USER_PASSWORD}</strong>? No próximo login será exigida uma nova
                    senha.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleResetPassword(editing)}
                      className="flex-1 rounded-lg bg-amber-600 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Confirmar reset
                    </button>
                  </div>
                </div>
              )}
            </div>
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

      {/* Modal Configurações Gerais da Lotérica */}
      <Modal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Configurações da lotérica"
        subtitle="Nome da loja, horário de funcionamento e jornada diária"
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
