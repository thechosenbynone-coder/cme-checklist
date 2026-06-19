import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import Login from './pages/Login';
import Hub from './pages/Hub';
import EquipamentoSelecao from './pages/EquipamentoSelecao';
import ChecklistPreenchimento from './pages/ChecklistPreenchimento';
import api, { getBaseUrl } from './services/api';

const BUNDLE_VERSION = '1.0.0';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!api.auth.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const checkUpdates = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        const baseUrl = getBaseUrl();
        if (!baseUrl) return;

        const response = await fetch(`${baseUrl}/api/update/check?currentVersion=${BUNDLE_VERSION}`);
        if (!response.ok) return;

        const data = await response.json();
        if (data.updateAvailable && data.url) {
          setUpdating(true);
          const version = await CapacitorUpdater.download({
            url: data.url,
            version: data.version,
          });
          await CapacitorUpdater.set({ id: version.id });
        }
      } catch (err) {
        console.error('Update check failed:', err);
        setUpdating(false);
      }
    };

    checkUpdates();
  }, []);

  if (updating) {
    return (
      <div className="fixed inset-0 bg-bg text-content flex flex-col items-center justify-center z-50 p-6 font-sans">
        <div className="h-14 w-14 rounded-2xl bg-accent text-white grid place-items-center mb-4 animate-pulse shadow-lg shadow-accent/20 text-xl font-bold">
          ⚡
        </div>
        <h2 className="text-base font-bold uppercase tracking-wider text-content">Atualizando CME Checklist</h2>
        <p className="text-[11px] text-muted mt-2 text-center leading-normal">
          Baixando nova versão do sistema. <br />
          O aplicativo reiniciará em instantes.
        </p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Hub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/novo"
          element={
            <ProtectedRoute>
              <EquipamentoSelecao />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checklist/:id"
          element={
            <ProtectedRoute>
              <ChecklistPreenchimento />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;