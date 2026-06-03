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

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
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
  
  const baseStyles = 'bg-white rounded-xl shadow-md overflow-hidden transition-all duration-200';
  
  const hoverStyles = (hoverable || isClickable) 
    ? 'hover:-translate-y-0.5 hover:shadow-lg cursor-pointer active:scale-99' 
    : '';

  return (
    <div 
      className={cn(baseStyles, hoverStyles, className)}
      onClick={onClick}
    >
      {(title || subtitle || headerAction) && (
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            {title && (
              <h3 className="font-semibold text-slate-900 text-sm md:text-base leading-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-1">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div className="ml-4">{headerAction}</div>}
        </div>
      )}
      
      <div className="p-6">{children}</div>
      
      {footer && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs md:text-sm">
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
