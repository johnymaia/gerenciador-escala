import { CalendarCheck2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { PublicEmployee, ShopSettings } from '../../shared/types';
import { api, ApiError } from '../lib/api';

interface LoginPageProps {
  onSuccess: (user: PublicEmployee, settings: ShopSettings) => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username, password);
      onSuccess(res.user, res.settings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm">
            <CalendarCheck2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Escala de Folgas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Acesse com seu usuário e senha
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Usuário
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex.: ana"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-3.5 pr-11 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 active:scale-[0.99] disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Dica: salve este site na tela inicial do celular para abrir como app.
        </p>
      </div>
    </div>
  );
}
