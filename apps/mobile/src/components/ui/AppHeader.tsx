import React from 'react';
import { cn } from '../../lib/cn';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Progress 0–100. If provided, renders a progress bar. */
  progress?: number;
  progressLabel?: string;
  children?: React.ReactNode;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  onBack,
  progress,
  progressLabel,
  children,
}) => {
  return (
    <div className={cn('bg-primary text-white safe-top flex-shrink-0')}>
      <div className="px-4 py-3 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg hover:bg-white/10 active:scale-95 transition min-h-[48px] min-w-[48px] flex items-center justify-center"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xs font-bold leading-tight uppercase tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[10px] text-white/60 font-semibold uppercase truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <ThemeToggle />
        {children}
      </div>

      {progress !== undefined && (
        <div className="px-4 pb-3 space-y-1.5">
          {progressLabel && (
            <div className="flex justify-between text-[11px] font-bold text-white/70">
              <span>{progressLabel}</span>
              <span>{progress}%</span>
            </div>
          )}
          <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AppHeader;
