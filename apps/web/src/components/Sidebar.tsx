import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, LogOut } from 'lucide-react';
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

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/inspecoes', label: 'Inspeções', icon: ClipboardList }
  ];

  return (
    <aside className="h-screen sticky top-0 bg-white border-r border-slate-100 flex flex-col justify-between overflow-hidden w-[76px] py-4">
      <div className="flex flex-col items-center flex-1">
        {/* Logo at top */}
        <div className="pt-2 pb-6">
          <div className="h-9 w-9 rounded-xl bg-blue-600 text-white grid place-items-center text-[10px] font-extrabold tracking-wide select-none shadow-sm">
            CME
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col items-center gap-4 w-full">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "h-11 w-11 rounded-xl grid place-items-center transition-all duration-200 outline-none",
                  active 
                    ? "ring-2 ring-blue-400/60 shadow-[0_0_0_5px_rgba(59,130,246,0.12)] text-blue-700 bg-blue-50/50" 
                    : "hover:ring-2 hover:ring-blue-400/45 text-slate-700 hover:bg-slate-50"
                )}
                title={item.label}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom user & logout section */}
      <div className="flex flex-col items-center gap-4 p-3 border-t border-slate-50">
        <button
          onClick={handleLogout}
          className="h-11 w-11 rounded-xl grid place-items-center transition text-slate-500 hover:text-red-650 hover:bg-red-50 hover:ring-2 hover:ring-red-200/50"
          title="Sair"
        >
          <LogOut size={18} />
        </button>

        <div className="flex flex-col items-center">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 via-indigo-100 to-sky-100 border border-blue-200/70 grid place-items-center text-xs font-bold text-blue-700 shadow-sm">
            {currentUser?.nome ? currentUser.nome.charAt(0).toUpperCase() : 'U'}
          </div>
          <span className="text-center text-[9px] font-semibold text-slate-550 truncate max-w-[64px] mt-1.5 leading-none">
            {currentUser?.nome ? currentUser.nome.split(' ')[0] : 'Usuário'}
          </span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
