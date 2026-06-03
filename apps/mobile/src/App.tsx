import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import EquipamentoSelecao from './pages/EquipamentoSelecao';
import ChecklistPreenchimento from './pages/ChecklistPreenchimento';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EquipamentoSelecao />} />
        <Route path="/checklist" element={<ChecklistPreenchimento />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
