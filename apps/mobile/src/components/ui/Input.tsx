import React from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className, wrapperClassName, ...props }, ref) => {
    return (
      <div className={cn('relative', wrapperClassName)}>
        {icon && (
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-content',
            'placeholder:text-muted/70',
            'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
            'transition-colors duration-150',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            icon && 'pl-10',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
