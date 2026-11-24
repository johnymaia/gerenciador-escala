import {
  CalendarCheck2,
  CalendarDays,
  Clock,
  Home,
  Loader2,
  LogOut,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PublicEmployee, ShopSettings } from '../shared/types';
import { api } from './lib/api';
import { EmployeesPage } from './pages/EmployeesPage';
import { HolidaysPage } from './pages/HolidaysPage';
import { HomePage } from './pages/HomePage';
import { HoursPage } from './pages/HoursPage';
import { LoginPage } from './pages/LoginPage';
import { TeamSchedulePage } from './pages/TeamSchedulePage';

type TabKey = 'home' | 'schedule' | 'hours' | 'holidays' | 'employees';

export function App() {
  const [user, setUser] = useState<PublicEmployee | null>(null);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [tab, setTab] = useState<TabKey>('home');

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

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setUser(null);
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

  const isAdmin = user.role === 'admin';

  const navItems: Array<{ key: TabKey; label: string; icon: typeof Home }> = isAdmin
    ? [
        ...(user.in_rotation ? [{ key: 'home' as const, label: 'Início', icon: Home }] : []),
        { key: 'schedule', label: 'Escala', icon: CalendarDays },
        { key: 'hours', label: 'Horas', icon: Clock },
        { key: 'holidays', label: 'Feriados', icon: Sparkles },
        { key: 'employees', label: 'Equipe', icon: Users },
      ]
    : [
        { key: 'home', label: 'Início', icon: Home },
        { key: 'schedule', label: 'Escala', icon: CalendarDays },
        { key: 'hours', label: 'Horas', icon: Clock },
      ];

  return (
    <div className="min-h-dvh bg-slate-50 pb-24 sm:pb-10">
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

          {/* Navegação desktop */}
          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-teal-50 text-teal-800'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

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
        {tab === 'hours' && <HoursPage user={user} />}
        {tab === 'holidays' && isAdmin && <HolidaysPage />}
        {tab === 'employees' && isAdmin && (
          <EmployeesPage
            currentUser={user}
            settings={settings}
            onSettingsUpdated={(s) => setSettings(s)}
          />
        )}
      </main>

      {/* Barra inferior fixa (mobile) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur-md sm:hidden">
        <div
          className="mx-auto grid max-w-lg px-2 pt-1.5"
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
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition ${
                  active ? 'text-teal-700' : 'text-slate-400'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
