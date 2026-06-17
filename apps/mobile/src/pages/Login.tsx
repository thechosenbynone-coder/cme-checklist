import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import api from '../services/api';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !senha) {
      setError('Informe usuário e senha.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.auth.login(identifier.trim(), senha);
      navigate('/');
    } catch (err: any) {
      setError(err?.message || 'Falha no login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle className="text-muted hover:text-content hover:bg-surface-2" />
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-sm p-7 max-w-sm w-full">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary text-white grid place-items-center mb-3 shadow-md">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-content uppercase tracking-tight">CME Checklist</h2>
          <p className="text-[10px] text-muted mt-1 uppercase font-bold tracking-wider">
            App de Campo
          </p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleLogin}>
          <div>
            <label htmlFor="identifier" className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
              Usuário ou E-mail
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-content placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              placeholder="Ex: Lucas Lima"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setError('');
              }}
            />
          </div>
          <div>
            <label htmlFor="senha" className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-content placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              placeholder="Sua senha"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setError('');
              }}
            />
          </div>

          {error && <p className="text-red-600 dark:text-red-400 text-xs text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-white font-bold rounded-xl min-h-[48px] w-full active:scale-[0.98] transition disabled:opacity-50 hover:bg-accent/90"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                Entrando...
              </span>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

      </div>
    </div>
  );
};

export default Login;