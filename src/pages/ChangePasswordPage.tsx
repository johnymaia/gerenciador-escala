import { Eye, EyeOff, KeyRound, Loader2, LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DEFAULT_USER_PASSWORD, type PublicEmployee } from '../../shared/types';
import { api, ApiError } from '../lib/api';

interface ChangePasswordPageProps {
  user: PublicEmployee;
  shopName: string;
  onChanged: (updatedUser: PublicEmployee) => void;
  onLogout: () => void;
}

export function ChangePasswordPage({
  user,
  shopName,
  onChanged,
  onLogout,
}: ChangePasswordPageProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = newPassword.trim();
    if (trimmed.length < 4) {
      setError('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }
    if (trimmed === DEFAULT_USER_PASSWORD) {
      setError(`Escolha uma senha diferente da padrão (${DEFAULT_USER_PASSWORD}).`);
      return;
    }
    if (trimmed !== confirmPassword.trim()) {
      setError('As duas senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.changePassword({ new_password: trimmed });
      onChanged(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
            <KeyRound className="h-7 w-7" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
            {shopName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Crie sua nova senha
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Olá, <strong className="text-slate-700">{user.name}</strong>! Como você entrou com a
            senha padrão (<code className="rounded bg-slate-200/70 px-1 py-0.5 text-xs">123456</code>),
            defina uma senha pessoal para continuar.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="new-pass"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Nova senha pessoal
              </label>
              <div className="relative">
                <input
                  id="new-pass"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={4}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-3.5 pr-11 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
                  aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-pass"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Confirmar nova senha
              </label>
              <input
                id="confirm-pass"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={4}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Digite novamente"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15"
              />
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
              Salvar nova senha e entrar
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={onLogout}
          className="mt-5 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair e entrar com outro usuário
        </button>
      </div>
    </div>
  );
}
