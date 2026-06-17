import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@cme/ui';
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
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-7">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-[#0b132b] text-[#38bdf8] grid place-items-center mb-3 shadow-md shadow-blue-900/10">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 uppercase tracking-tight">CME Checklist</h2>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-wider">
            App de Campo
          </p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleLogin}>
          <div>
            <label htmlFor="identifier" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Usuário ou E-mail
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Ex: Lucas Lima"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setError('');
              }}
            />
          </div>
          <div>
            <label htmlFor="senha" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Sua senha"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setError('');
              }}
            />
          </div>

          {error && <p className="text-red-600 text-xs text-center">{error}</p>}

          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={loading}
            className="bg-[#0b132b] text-white hover:bg-[#1b2a47] font-bold"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Entrando...
              </span>
            ) : (
              'Entrar'
            )}
          </Button>
        </form>

      </div>
    </div>
  );
};

export default Login;