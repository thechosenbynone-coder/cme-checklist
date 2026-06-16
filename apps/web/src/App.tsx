import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Equipamentos from './pages/Equipamentos';
import Configuracoes from './pages/Configuracoes';
import InspecaoDetalhes from './pages/InspecaoDetalhes';
import { Sidebar } from './components/Sidebar';
import api from './services/api';

// Protected Route Guard
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!api.auth.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-[#cbd9e7] p-4 gap-4 overflow-hidden font-sans">
      <Sidebar />
      <div className="flex-1 bg-[#f3f5f4] rounded-[2.5rem] shadow-[0_8px_32px_rgba(0,0,0,0.06)] overflow-y-auto border border-slate-200/30">
        <main className="p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        
        <Route
          path="/equipamentos"
          element={
            <ProtectedRoute>
              <Equipamentos />
            </ProtectedRoute>
          }
        />

        <Route
          path="/configuracoes"
          element={
            <ProtectedRoute>
              <Configuracoes />
            </ProtectedRoute>
          }
        />

        <Route
          path="/inspecoes/:id"
          element={
            <ProtectedRoute>
              <InspecaoDetalhes />
            </ProtectedRoute>
          }
        />
        
        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;