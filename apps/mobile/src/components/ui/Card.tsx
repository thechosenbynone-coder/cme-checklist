import React from 'react';
import { cn } from '../../lib/cn';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  headerAction,
  footer,
  className,
  onClick,
}) => {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-2xl shadow-sm overflow-hidden transition-colors duration-200',
        onClick && 'cursor-pointer active:scale-[0.99]',
        className,
      )}
      onClick={onClick}
    >
      {(title || subtitle || headerAction) && (
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h3 className="font-semibold text-content text-sm leading-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-muted mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}

      <div className="px-5 py-4">{children}</div>

      {footer && (
        <div className="px-5 py-3 bg-surface-2 border-t border-border flex items-center justify-between text-xs">
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
