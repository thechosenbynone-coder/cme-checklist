import React from 'react';
import { ShieldCheck } from 'lucide-react';

// Tela de abertura: identidade visual + indicador discreto. Fica de pé só
// o tempo de ler sessão local/hidratar cache — nunca espera rede.
export const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-bg text-content flex flex-col items-center justify-center z-50 p-6 font-sans">
      <div className="mx-auto h-14 w-14 rounded-xl bg-primary text-white grid place-items-center mb-4 shadow-md">
        <ShieldCheck className="h-8 w-8" />
      </div>
      <h1 className="text-base font-bold uppercase tracking-tight text-content">CME Checklist</h1>
      <p className="text-[11px] text-muted mt-2 uppercase font-bold tracking-wider">
        Preparando seu ambiente...
      </p>
    </div>
  );
};

export default SplashScreen;
