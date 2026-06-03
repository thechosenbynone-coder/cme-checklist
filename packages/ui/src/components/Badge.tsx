import React from 'react';

type BadgeType = 
  | 'OK' | 'PENDENTE' | 'NAO_APLICAVEL' 
  | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'VALIDADA' | 'CANCELADA'
  | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps {
  type: BadgeType;
  label?: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ type, label, className = '' }) => {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold select-none border tracking-wider uppercase';
  
  const styles: Record<BadgeType, string> = {
    // StatusItem
    OK: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
    PENDENTE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
    NAO_APLICAVEL: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    
    // StatusInspecao
    EM_ANDAMENTO: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900',
    CONCLUIDA: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
    VALIDADA: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900',
    CANCELADA: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900',
    
    // Generics
    info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
    danger: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900',
    neutral: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800',
  };

  const labels: Record<BadgeType, string> = {
    OK: 'OK',
    PENDENTE: 'Pendente',
    NAO_APLICAVEL: 'N/A',
    EM_ANDAMENTO: 'Em Andamento',
    CONCLUIDA: 'Concluída',
    VALIDADA: 'Validada',
    CANCELADA: 'Cancelada',
    info: 'Info',
    success: 'Sucesso',
    warning: 'Atenção',
    danger: 'Perigo',
    neutral: 'Neutro',
  };

  return (
    <span className={`${baseStyles} ${styles[type]} ${className}`}>
      {label || labels[type]}
    </span>
  );
};
