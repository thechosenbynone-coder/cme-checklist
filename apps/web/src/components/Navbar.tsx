import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ClipboardList, LayoutDashboard, LogOut, User as UserIcon } from 'lucide-react';
import api from '../services/api';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = api.auth.currentUser();

  const handleLogout = () => {
    // Clear user session
    window.localStorage.removeItem('cme_current_user');
    navigate('/login');
  };

  const isActive = (path: string) => {
    return location.pathname === path ? 'bg-brand-850 text-white' : 'text-slate-300 hover:bg-brand-800 hover:text-white';
  };

  return (
    <nav className="bg-brand-900 border-b border-brand-800 text-white sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center space-x-3">
              <span className="text-xl">📋</span>
              <div>
                <span className="font-bold tracking-wider text-base md:text-lg block leading-none text-white">CONTINENTAL</span>
                <span className="text-[9px] text-slate-400 font-medium tracking-widest block uppercase mt-0.5">Checklist CME</span>
              </div>
            </div>

            {/* Menu Links */}
            <div className="hidden md:block ml-10">
              <div className="flex space-x-2">
                <Link
                  to="/"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/')}`}
                >
                  <div className="flex items-center space-x-1.5">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
                  </div>
                </Link>
                <Link
                  to="/inspecoes"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/inspecoes')}`}
                >
                  <div className="flex items-center space-x-1.5">
                    <ClipboardList className="h-4 w-4" />
                    <span>Inspeções</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 border-r border-brand-800 pr-4">
              <div className="bg-brand-800 h-8 w-8 rounded-full flex items-center justify-center border border-brand-700">
                <UserIcon className="h-4 w-4 text-slate-300" />
              </div>
              <div className="text-left">
                <span className="block text-xs font-semibold text-slate-200 leading-tight">{currentUser?.nome || 'Convidado'}</span>
                <span className="block text-[10px] text-slate-400 leading-none">{currentUser?.funcao || 'Operador'}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-slate-300 hover:text-rose-400 p-2 rounded-lg hover:bg-brand-800 transition-colors flex items-center space-x-1"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-xs font-medium hidden md:inline">Sair</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu navigation */}
      <div className="md:hidden border-t border-brand-850 px-2 py-3 bg-brand-950 flex justify-around">
        <Link
          to="/"
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-semibold mx-1 ${
            location.pathname === '/' ? 'bg-brand-800 text-white' : 'text-slate-400'
          }`}
        >
          <LayoutDashboard className="h-4 w-4 mx-auto mb-1" />
          Dashboard
        </Link>
        <Link
          to="/inspecoes"
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-semibold mx-1 ${
            location.pathname === '/inspecoes' ? 'bg-brand-800 text-white' : 'text-slate-400'
          }`}
        >
          <ClipboardList className="h-4 w-4 mx-auto mb-1" />
          Inspeções
        </Link>
      </div>
    </nav>
  );
};
