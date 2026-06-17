import React from 'react';
import { cn } from '../../lib/cn';
import { Check, AlertTriangle, HelpCircle, XCircle } from 'lucide-react';

type ChipStatus = 'OK' | 'PENDENTE' | 'NAO_APLICAVEL' | 'ERRO';

interface StatusChipProps {
  status: ChipStatus;
  selected?: boolean;
  label?: string;
  onClick?: () => void;
  className?: string;
}

const config: Record<ChipStatus, {
  icon: React.ElementType;
  label: string;
  base: string;
  active: string;
}> = {
  OK: {
    icon: Check,
    label: 'OK',
    base: 'border-emerald-200 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300',
    active: 'bg-emerald-600 dark:bg-emerald-600 border-emerald-600 dark:border-emerald-600 text-white dark:text-white shadow-sm',
  },
  PENDENTE: {
    icon: AlertTriangle,
    label: 'Pendente',
    base: 'border-amber-200 text-amber-700 dark:border-amber-500/30 dark:text-amber-300',
    active: 'bg-amber-500 dark:bg-amber-500 border-amber-500 dark:border-amber-500 text-white dark:text-white shadow-sm',
  },
  NAO_APLICAVEL: {
    icon: HelpCircle,
    label: 'N/A',
    base: 'border-slate-200 text-slate-600 dark:border-white/15 dark:text-muted',
    active: 'bg-slate-500 dark:bg-slate-500 border-slate-500 dark:border-slate-500 text-white dark:text-white shadow-sm',
  },
  ERRO: {
    icon: XCircle,
    label: 'Erro',
    base: 'border-red-200 text-red-700 dark:border-red-500/30 dark:text-red-300',
    active: 'bg-red-600 dark:bg-red-600 border-red-600 dark:border-red-600 text-white dark:text-white shadow-sm',
  },
};

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  selected = false,
  label,
  onClick,
  className,
}) => {
  const cfg = config[status];
  const Icon = cfg.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 py-3.5 px-2 rounded-xl text-xs font-bold border',
        'transition-all duration-150 active:scale-[0.97] min-h-[48px]',
        selected
          ? cfg.active
          : cn('bg-surface', cfg.base, 'hover:bg-surface-2'),
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label || cfg.label}</span>
    </button>
  );
};

export default StatusChip;
