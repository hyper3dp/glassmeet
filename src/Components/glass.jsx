import React from 'react';
import { cn } from '@/lib/utils';

export function GlassCard({ className, children, hover = true, liquid = false, ...props }) {
  return (
    <div className={cn('p-6', hover ? 'glass-card' : 'glass-panel', liquid && 'liquid-glass', className)} {...props}>
      {children}
    </div>
  );
}

export function GlassButton({ className, variant = 'default', size = 'md', liquid = false, children, as, ...props }) {
  const base = 'glass-button inline-flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-50 disabled:pointer-events-none';
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3.5 text-base',
  };
  const variants = {
    default: 'text-foreground',
    primary: 'accent-bg text-white border-transparent hover:opacity-90',
    ghost: 'bg-transparent border-transparent hover:bg-foreground/5',
    danger: 'text-red-500 hover:bg-red-500/10',
  };
  const Comp = as || 'button';
  return (
    <Comp className={cn(base, sizes[size], variants[variant], liquid && 'liquid-glass', className)} {...props}>
      {children}
    </Comp>
  );
}

export function GlassInput({ className, ...props }) {
  return (
    <input
      className={cn('glass-input w-full px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground', className)}
      {...props}
    />
  );
}

export function GlassTextarea({ className, ...props }) {
  return (
    <textarea
      className={cn('glass-input w-full px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none', className)}
      {...props}
    />
  );
}

export function GlassLabel({ className, children, ...props }) {
  return (
    <label className={cn('block text-sm font-medium text-foreground mb-1.5', className)} {...props}>
      {children}
    </label>
  );
}

export function GlassBadge({ className, children, color, ...props }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium glass border', className)}
      style={color ? { color, borderColor: color + '40', background: color + '14' } : undefined}
      {...props}
    >
      {children}
    </span>
  );
}

export function GlassSelect({ className, children, ...props }) {
  return (
    <select
      className={cn('glass-input w-full px-4 py-3 text-sm text-foreground cursor-pointer', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-fade-in">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-1.5">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-5">{description}</p>}
      {action}
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <div className={cn('w-6 h-6 border-2 border-foreground/20 border-t-accent rounded-full animate-spin', className)} />
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="w-8 h-8" />
    </div>
  );
}