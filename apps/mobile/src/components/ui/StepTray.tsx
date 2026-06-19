import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/cn';

interface StepTrayProps {
  index: number;
  title: string;
  state: 'idle' | 'active' | 'done';
  summary?: string;
  onEdit?: () => void;
  onAnimationComplete?: () => void;
  children: React.ReactNode;
}

export const StepTray: React.FC<StepTrayProps> = ({
  index,
  title,
  state,
  summary,
  onEdit,
  onAnimationComplete,
  children,
}) => {
  const isIdle = state === 'idle';
  const isActive = state === 'active';
  const isDone = state === 'done';

  return (
    <div
      className={cn(
        "border rounded-2xl transition-all duration-200 overflow-hidden",
        isActive && "bg-surface border-accent shadow-sm",
        isDone && "bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/30",
        isIdle && "bg-surface/50 border-border opacity-50 pointer-events-none"
      )}
    >
      {/* Header */}
      <div
        onClick={() => {
          if (isDone && onEdit) {
            onEdit();
          }
        }}
        className={cn(
          "px-4 py-3 flex items-center justify-between gap-3 select-none",
          isDone && "cursor-pointer hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 active:scale-[0.99] transition-all"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-5 w-5 rounded-full text-[10px] font-bold grid place-items-center flex-shrink-0 border",
                isActive && "bg-accent border-accent text-white",
                isDone && "bg-emerald-500 border-emerald-500 text-white",
                isIdle && "bg-surface border-border text-muted"
              )}
            >
              {isDone ? <CheckCircle2 className="h-3 w-3" /> : index}
            </span>
            <span
              className={cn(
                "text-xs font-bold uppercase tracking-wide",
                isActive && "text-content",
                isDone && "text-emerald-700 dark:text-emerald-400",
                isIdle && "text-muted"
              )}
            >
              {title}
            </span>
          </div>
          {isDone && summary && (
            <span className="text-[10px] text-muted block truncate mt-1 pl-7 font-medium">
              {summary}
            </span>
          )}
        </div>
        {isDone && (
          <span className="text-[9px] font-bold text-accent-text uppercase tracking-wider px-2 py-1 rounded bg-accent/10 active:scale-95 transition-all">
            Editar
          </span>
        )}
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {isActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            onAnimationComplete={onAnimationComplete}
          >
            <div className="px-4 pb-4 border-t border-border pt-4 bg-surface">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StepTray;
