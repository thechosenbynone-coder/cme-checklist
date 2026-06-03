import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  hoverable?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  headerAction,
  footer,
  hoverable = false,
  className = '',
  onClick,
}) => {
  const isClickable = !!onClick;
  
  const baseStyles = 'bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-200 dark:bg-slate-900 dark:border-slate-800';
  
  const hoverStyles = (hoverable || isClickable) 
    ? 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer active:scale-99' 
    : '';

  return (
    <div 
      className={`${baseStyles} ${hoverStyles} ${className}`}
      onClick={onClick}
    >
      {(title || subtitle || headerAction) && (
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            {title && (
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm md:text-base leading-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div className="ml-4">{headerAction}</div>}
        </div>
      )}
      
      <div className="p-5">{children}</div>
      
      {footer && (
        <div className="px-5 py-3.5 bg-slate-50/50 border-t border-slate-100 dark:bg-slate-950/20 dark:border-slate-800 flex items-center justify-between text-xs md:text-sm">
          {footer}
        </div>
      )}
    </div>
  );
};
