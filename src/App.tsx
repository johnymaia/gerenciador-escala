import {
  ArrowLeftRight,
  CalendarCheck2,
  CalendarDays,
  Home,
  KeyRound,
  Loader2,
  LogOut,
  Palmtree,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_USER_PASSWORD, type PublicEmployee, type ShopSettings } from '../shared/types';
import { Modal } from './components/Modal';
import { api, ApiError } from './lib/api';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { HolidaysPage } from './pages/HolidaysPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SwapsPage } from './pages/SwapsPage';
import { TeamSchedulePage } from './pages/TeamSchedulePage';
import { VacationsPage } from './pages/VacationsPage';

type TabKey = 'home' | 'schedule' | 'swaps' | 'vacations' | 'holidays' | 'employees';

export function App() {
  const [user, setUser] = useState<PublicEmployee | null>(null);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [tab, setTab] = useState<TabKey>('home');
  const [pendingSwaps, setPendingSwaps] = useState(0);
  const [pendingVacations, setPendingVacations] = useState(0);

  // Modal opcional para o próprio usuário trocar a senha quando quiser
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((res) => {
        setUser(res.user);
        setSettings(res.settings);
        setTab(res.user.role === 'admin' && !res.user.in_rotation ? 'schedule' : 'home');
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    if (!user || user.must_change_password) {
      setPendingSwaps(0);
      setPendingVacations(0);
      return;
    }
    api
      .listSwaps()
      .then((res) => setPendingSwaps(res.pending_action_count))
      .catch(() => undefined);
    api
      .listVacations()
      .then((res) => setPendingVacations(res.pending_admin_count))
      .catch(() => undefined);
  }, [user, tab]);

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setUser(null);
    setPendingSwaps(0);
    setPendingVacations(0);
  }

  async function handleVoluntaryPasswordChange(e: FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwDone(false);

    if (newPw.trim().length < 4) {
      setPwError('A nova senha precisa ter pelo menos 4 caracteres.');
      return;
    }
    if (newPw.trim() === DEFAULT_USER_PASSWORD) {
      setPwError(`A nova senha não pode ser ${DEFAULT_USER_PASSWORD}.`);
      return;
    }
    if (newPw.trim() !== confirmPw.trim()) {
      setPwError('As duas senhas não conferem.');
      return;
    }

    setPwSaving(true);
    try {
      const res = await api.changePassword({
        current_password: curPw,
        new_password: newPw.trim(),
      });
      setUser(res.user);
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
      setPwDone(true);
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Erro ao alterar senha.');
    } finally {
      setPwSaving(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-teal-700" />
      </div>
    );
  }

  if (!user || !settings) {
    return (
      <LoginPage
        onSuccess={(u, s) => {
          setUser(u);
          setSettings(s);
          setTab(u.role === 'admin' && !u.in_rotation ? 'schedule' : 'home');
        }}
      />
    );
  }

  // Bloqueio obrigatório no 1º acesso ou após reset pelo administrador
  if (user.must_change_password) {
    return (
      <ChangePasswordPage
        user={user}
        shopName={settings.shop_name}
        onChanged={(updated) => setUser(updated)}
        onLogout={handleLogout}
      />
    );
  }

  const isAdmin = user.role === 'admin';

  const navItems: Array<{ key: TabKey; label: string; icon: typeof Home; badge?: number }> = isAdmin
    ? [
        ...(user.in_rotation ? [{ key: 'home' as const, label: 'Início', icon: Home }] : []),
        { key: 'schedule', label: 'Escala', icon: CalendarDays },
        { key: 'swaps', label: 'Trocas', icon: ArrowLeftRight, badge: pendingSwaps },
        { key: 'vacations', label: 'Férias', icon: Palmtree, badge: pendingVacations },
        { key: 'holidays', label: 'Feriados', icon: Sparkles },
        { key: 'employees', label: 'Equipe', icon: Users },
      ]
    : [
        { key: 'home', label: 'Início', icon: Home },
        { key: 'schedule', label: 'Escala', icon: CalendarDays },
        { key: 'swaps', label: 'Trocas', icon: ArrowLeftRight, badge: pendingSwaps },
        { key: 'vacations', label: 'Férias', icon: Palmtree },
      ];

  return (
    <div className="min-h-dvh bg-slate-50 pb-24">
      {/* Topo limpo */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-white">
              <CalendarCheck2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight text-slate-900">
                {settings.shop_name}
              </div>
              <div className="text-[11px] leading-tight text-slate-400">
                {user.name} • {isAdmin ? 'Admin' : 'Funcionária'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setCurPw('');
                setNewPw('');
                setConfirmPw('');
                setPwError('');
                setPwDone(false);
                setPwModalOpen(true);
              }}
              title="Alterar minha senha"
              aria-label="Alterar minha senha"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Sair"
              aria-label="Sair"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="mx-auto max-w-3xl px-4 pt-5">
        {tab === 'home' && (
          <HomePage
            user={user}
            settings={settings}
            onNavigate={(next) => setTab(next)}
          />
        )}
        {tab === 'schedule' && <TeamSchedulePage user={user} />}
        {tab === 'swaps' && (
          <SwapsPage user={user} onPendingCountChange={setPendingSwaps} />
        )}
        {tab === 'vacations' && (
          <VacationsPage user={user} onPendingCountChange={setPendingVacations} />
        )}
        {tab === 'holidays' && isAdmin && <HolidaysPage />}
        {tab === 'employees' && isAdmin && (
          <EmployeesPage
            currentUser={user}
            settings={settings}
            onSettingsUpdated={(s) => setSettings(s)}
          />
        )}
      </main>

      {/* Barra inferior fixa (sempre visível em todas as telas, foco mobile-first) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div
          className="mx-auto grid max-w-lg px-2 py-1.5"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition ${
                  active ? 'text-teal-700' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className="relative">
                  <Icon className={`h-5 w-5 ${active ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
                  {item.badge ? (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="truncate max-w-full px-0.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modal: Alterar minha própria senha */}
      <Modal
        open={pwModalOpen}
        onClose={() => setPwModalOpen(false)}
        title="Alterar minha senha"
        subtitle={`Usuário @${user.username}`}
      >
        <form onSubmit={handleVoluntaryPasswordChange} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Senha atual</label>
            <input
              type="password"
              required
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nova senha</label>
            <input
              type="password"
              required
              minLength={4}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Confirmar nova senha
            </label>
            <input
              type="password"
              required
              minLength={4}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>

          {pwError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {pwError}
            </div>
          )}
          {pwDone && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Senha alterada com sucesso!
            </div>
          )}

          <button
            type="submit"
            disabled={pwSaving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {pwSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar nova senha
          </button>
        </form>
      </Modal>
    </div>
  );
}
