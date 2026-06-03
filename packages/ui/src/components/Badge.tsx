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

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export const Badge: React.FC<BadgeProps> = ({ type, label, className = '' }) => {
  const baseStyles = 'inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full select-none';

  const toneMap: Record<BadgeType, string> = {
    // StatusItem
    OK: 'bg-green-100 text-green-700',
    PENDENTE: 'bg-yellow-100 text-yellow-700',
    NAO_APLICAVEL: 'bg-gray-100 text-gray-700',
    
    // StatusInspecao
    EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
    CONCLUIDA: 'bg-green-100 text-green-700',
    VALIDADA: 'bg-blue-100 text-blue-700',
    CANCELADA: 'bg-red-100 text-red-700',
    
    // Generics
    info: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-700',
  };

  const labelMap: Record<BadgeType, string> = {
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
    <span className={cn(baseStyles, toneMap[type] || 'bg-gray-100 text-gray-700', className)}>
      {label || labelMap[type]}
    </span>
  );
};

export default Badge;
