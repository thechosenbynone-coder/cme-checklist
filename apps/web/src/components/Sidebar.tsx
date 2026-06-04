import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Plus, 
  Wrench, 
  FileSpreadsheet, 
  HelpCircle, 
  Settings,
  LogOut 
} from 'lucide-react';
import api from '../services/api';

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = api.auth.currentUser();

  const handleLogout = () => {
    window.localStorage.removeItem('cme_current_user');
    navigate('/login');
  };

  const handleNewChecklist = () => {
    // Abre a versão mobile em outra aba para simular o preenchimento de campo
    const mobileUrl = window.location.port === '5174' 
      ? 'http://localhost:5173' 
      : `${window.location.protocol}//${window.location.hostname}:5173`;
    window.open(mobileUrl, '_blank');
  };

  // Itens do Menu
  const menuItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, enabled: true },
    { path: '/equipamentos', label: 'Equipamentos (Em breve)', icon: Wrench, enabled: false },
    { path: '/materiais', label: 'Materiais (Em breve)', icon: FileSpreadsheet, enabled: false },
    { path: '/configuracoes', label: 'Configurações', icon: Settings, enabled: false }
  ];

  return (
    <aside className="h-full bg-[#0b132b] text-slate-400 flex flex-col justify-between overflow-hidden w-[76px] py-6 rounded-[2.5rem] shadow-[0_12px_40px_rgba(0,0,0,0.15)] border border-slate-900/40">
      <div className="flex flex-col items-center flex-1">
        {/* Top + Button (New Checklist) */}
        <div className="pb-8">
          <button
            onClick={handleNewChecklist}
            className="h-11 w-11 rounded-xl bg-white hover:bg-slate-100 text-slate-900 grid place-items-center transition duration-200 shadow-md active:scale-95 group"
            title="Nova Inspeção de Campo"
          >
            <Plus className="h-5 w-5 transition group-hover:rotate-90" />
          </button>
        </div>

        {/* Navigation capsule list */}
        <nav className="flex flex-col items-center gap-5 w-full">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = item.enabled && (location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path)));
            
            return (
              <button
                key={item.label}
                disabled={!item.enabled}
                onClick={() => item.enabled && navigate(item.path)}
                className={cn(
                  "h-11 w-11 rounded-2xl grid place-items-center transition-all duration-200 outline-none relative group",
                  active 
                    ? "bg-[#1c2541] text-[#38bdf8] shadow-sm" 
                    : item.enabled 
                      ? "hover:bg-[#161e38] text-slate-500 hover:text-white" 
                      : "text-slate-650 opacity-30 cursor-not-allowed"
                )}
                title={item.label}
              >
                <Icon size={18} />
                
                {/* Active indicator bar */}
                {active && (
                  <span className="absolute left-0 w-1 h-5 bg-[#38bdf8] rounded-r-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom section: Help, Logout and User profile */}
      <div className="flex flex-col items-center gap-5 pt-4 border-t border-slate-800/40">
        
        {/* Help */}
        <button
          className="h-9 w-9 rounded-xl grid place-items-center text-slate-600 hover:text-white hover:bg-slate-800/30 transition-all"
          title="Ajuda"
        >
          <HelpCircle size={18} />
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="h-9 w-9 rounded-xl grid place-items-center text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-all"
          title="Sair"
        >
          <LogOut size={18} />
        </button>

        {/* Profile Circle */}
        <div className="relative group cursor-pointer mt-1">
          <div className="h-10 w-10 rounded-full bg-slate-800 hover:ring-2 hover:ring-[#38bdf8] transition overflow-hidden border border-slate-700/60 grid place-items-center font-extrabold text-white text-xs select-none">
            {currentUser?.nome ? currentUser.nome.charAt(0).toUpperCase() : 'U'}
          </div>
          {/* Status Dot */}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[#0b132b]" />
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
