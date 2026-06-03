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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8">
        <div>
          {/* Logo */}
          <div className="mx-auto h-12 w-12 rounded-xl bg-blue-600 text-white grid place-items-center">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="mt-6 text-center text-2xl font-semibold text-slate-900">
            Continental
          </h2>
          <p className="mt-1 text-center text-sm text-slate-500">
            CME Checklist Portal
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleCustomLogin}>
          <div>
            <label htmlFor="email-address" className="block text-sm font-medium text-slate-700 mb-1.5">
              Endereço de E-mail
            </label>
            <input
              id="email-address"
              name="email"
              type="email"
              required
              className="block w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/60 focus:border-blue-500 transition"
              placeholder="Insira seu e-mail corporativo"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
            />
          </div>

          {error && <p className="text-red-600 text-xs text-center">{error}</p>}

          <Button type="submit" fullWidth size="lg">
            Entrar no Portal
          </Button>
        </form>

        {/* Quick Profiles para simplificar testes */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Acesso Rápido (Sandbox)
          </p>
          <div className="space-y-2">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => handleQuickLogin(user)}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 text-left group"
              >
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-100 via-indigo-100 to-sky-100 border border-blue-200/70 flex items-center justify-center">
                    <UserCheck className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-slate-900">{user.nome}</span>
                    <span className="block text-[11px] text-slate-500">{user.funcao}</span>
                  </div>
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
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
