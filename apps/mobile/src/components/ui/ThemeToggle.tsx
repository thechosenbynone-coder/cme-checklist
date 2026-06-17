import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { cn } from '../../lib/cn';

const modes = [
  { value: 'light' as const, Icon: Sun, label: 'Claro' },
  { value: 'dark' as const, Icon: Moon, label: 'Escuro' },
  { value: 'system' as const, Icon: Monitor, label: 'Sistema' },
];

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    const idx = modes.findIndex((m) => m.value === theme);
    const next = modes[(idx + 1) % modes.length];
    setTheme(next.value);
  };

  const current = modes.find((m) => m.value === theme) || modes[2];
  const Icon = current.Icon;

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        'p-2 rounded-lg hover:bg-white/10 active:scale-95 transition',
        'min-h-[44px] min-w-[44px] flex items-center justify-center',
        className,
      )}
      aria-label={`Tema: ${current.label}`}
      title={`Tema: ${current.label}`}
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  );
};

export default ThemeToggle;
