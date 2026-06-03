import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, UserCheck } from 'lucide-react';
import { Button } from '@cme/ui';
import api from '../services/api';
import { User } from '@cme/types';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Carregar usuários mock do banco
    api.auth.listUsers().then(data => setUsers(data));
  }, []);

  const handleQuickLogin = (user: User) => {
    api.auth.setCurrentUser(user);
    navigate('/');
  };

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Por favor, informe o email.');
      return;
    }

    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
    if (found) {
      api.auth.setCurrentUser(found);
      navigate('/');
    } else {
      // Simula criação caso não exista
      const newUser: User = {
        id: `usr-custom-${Date.now()}`,
        nome: email.split('@')[0].replace('.', ' '),
        email: email.trim(),
        funcao: 'Operador'
      };
      api.auth.setCurrentUser(newUser);
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background gradients decorativos */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px]"></div>

      <div className="max-w-md w-full space-y-8 bg-slate-800/80 border border-slate-700/50 backdrop-blur-xl p-8 rounded-2xl shadow-xl relative z-10">
        <div>
          {/* Logo */}
          <div className="mx-auto h-14 w-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
            Continental
          </h2>
          <p className="mt-2 text-center text-xs font-semibold uppercase tracking-widest text-indigo-400">
            CME Checklist Portal
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleCustomLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Endereço de E-mail
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                required
                className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-slate-700 bg-slate-900/50 placeholder-slate-500 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="Insira seu e-mail corporativo"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
              />
            </div>
          </div>

          {error && <p className="text-rose-400 text-xs text-center">{error}</p>}

          <div>
            <Button type="submit" fullWidth size="lg">
              Entrar no Portal
            </Button>
          </div>
        </form>

        {/* Quick Profiles para simplificar testes */}
        <div className="mt-8 pt-6 border-t border-slate-700/60">
          <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Acesso Rápido (Sandbox)
          </p>
          <div className="space-y-2">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => handleQuickLogin(user)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-700/30 rounded-xl transition-all duration-200 text-left hover:scale-102 group active:scale-98"
              >
                <div className="flex items-center space-x-3">
                  <div className="bg-indigo-900/50 text-indigo-400 h-9 w-9 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-slate-200">{user.nome}</span>
                    <span className="block text-[10px] text-slate-400">{user.funcao}</span>
                  </div>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-semibold group-hover:border-indigo-500/50 group-hover:text-indigo-400 transition-colors">
                  Acessar
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
