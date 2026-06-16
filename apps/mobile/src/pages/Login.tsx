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
  const [showConfig, setShowConfig] = useState(false);
  const [tempUrl, setTempUrl] = useState('');

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

        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col items-center">
          <button
            type="button"
            onClick={() => {
              setShowConfig(!showConfig);
              setTempUrl(api.config.getBaseUrl());
            }}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider transition"
          >
            {showConfig ? 'Ocultar Configuração' : 'Configurar Servidor'}
          </button>

          {showConfig && (
            <div className="mt-4 w-full space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  URL do Servidor API
                </label>
                <input
                  type="text"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 outline-none focus:ring-1 focus:ring-blue-200"
                  placeholder="Ex: https://cme-checklist-api.onrender.com"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    api.config.setBaseUrl(tempUrl);
                    window.location.reload();
                  }}
                  className="flex-1 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 active:scale-95 transition"
                >
                  Salvar e Reiniciar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    api.config.clearBaseUrl();
                    window.location.reload();
                  }}
                  className="px-3 py-1.5 bg-slate-200 text-slate-650 rounded-lg text-xs font-bold hover:bg-slate-350 active:scale-95 transition"
                  title="Restaurar padrão"
                >
                  Padrão
                </button>
              </div>
              <p className="text-[8px] text-slate-400 text-center font-medium leading-normal">
                Padrão compilado: <br />
                <code className="text-slate-500">{import.meta.env.VITE_API_BASE_URL || '(vazio)'}</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;