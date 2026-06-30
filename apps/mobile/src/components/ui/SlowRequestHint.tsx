import { useEffect, useState } from 'react';

const HINT_DELAY_MS = 4000;

// Mostra `true` se `active` permanecer ligado por mais que HINT_DELAY_MS —
// usado para revelar uma mensagem de espera só quando a operação está
// genuinamente demorando (evita flicker em respostas rápidas).
export function useSlowRequestHint(active: boolean, delayMs: number = HINT_DELAY_MS): boolean {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!active) {
      setShowHint(false);
      return;
    }
    const timer = setTimeout(() => setShowHint(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return showHint;
}

export const SlowRequestHint: React.FC<{ show: boolean; className?: string }> = ({ show, className }) => {
  if (!show) return null;
  return (
    <p className={className ?? 'text-[11px] text-muted text-center leading-relaxed mt-2'}>
      O servidor está iniciando. Você já pode continuar.
    </p>
  );
};

export default SlowRequestHint;
