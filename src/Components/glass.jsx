import React from 'react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// GlassMeet's page-level building blocks, built on the shadcn/ui primitives in ./ui.
// The names are historical; the look is the Calendly light/dark system described in CLAUDE.md.

export function GlassCard({ className, children, hover = true, liquid: _liquid, ...props }) {
  return (
    <Card className={cn('p-6 gap-0', hover && 'hover:border-border-hover', className)} {...props}>
      {children}
    </Card>
  );
}

const BUTTON_VARIANTS = { default: 'outline', primary: 'default', brand: 'brand', soft: 'secondary', ghost: 'ghost', danger: 'destructive', link: 'link' };
const BUTTON_SIZES = { sm: 'sm', md: 'default', lg: 'lg' };

export function GlassButton({ className, variant = 'default', size = 'md', liquid: _liquid, children, as, type, ...props }) {
  const shadcnVariant = BUTTON_VARIANTS[variant];
  const shadcnSize = BUTTON_SIZES[size];
  const extra = cn(size === 'md' && 'px-5', className);
  if (as) {
    const Comp = as;
    return <Comp className={cn(buttonVariants({ variant: shadcnVariant, size: shadcnSize }), extra)} {...props}>{children}</Comp>;
  }
  // Pass variant/size through rather than pre-built classes, or Button layers its default (white) variant underneath.
  // Native <button> semantics: submits when inside a form unless a type is given.
  return <Button variant={shadcnVariant} size={shadcnSize} className={extra} type={type ?? 'submit'} {...props}>{children}</Button>;
}

export function GlassInput({ className, ...props }) {
  return <Input className={cn('h-11 px-3.5 text-sm', className)} {...props} />;
}

export function GlassTextarea({ className, ...props }) {
  return <Textarea className={cn('px-3.5 py-3 text-sm resize-none', className)} {...props} />;
}

export function GlassLabel({ className, children, ...props }) {
  return (
    <Label className={cn('block mb-2', className)} {...props}>
      {children}
    </Label>
  );
}

export function GlassBadge({ className, children, color, ...props }) {
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 px-3 py-1', className)}
      style={color ? { color, borderColor: color + '40', background: color + '14' } : undefined}
      {...props}
    >
      {children}
    </Badge>
  );
}

// Native <select> (pages pass <option> children) styled to match the shadcn SelectTrigger
export function GlassSelect({ className, children, ...props }) {
  return (
    <select
      className={cn('flex h-11 w-full cursor-pointer rounded-lg border border-input bg-field px-3.5 text-sm text-foreground transition-all duration-200 hover:border-border-hover focus:border-ring focus:ring-1 focus:ring-ring focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50', className)}
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
        <div className="w-14 h-14 rounded-full bg-primary-soft flex items-center justify-center mb-5">
          <Icon className="w-6 h-6 text-link" />
        </div>
      )}
      <h3 className="text-lg font-bold tracking-tight text-foreground mb-1.5">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-5">{description}</p>}
      {action}
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <div className={cn('w-6 h-6 border-2 border-primary-soft border-t-primary rounded-full animate-spin', className)} />
  );
}

export function PageLoader() {
  return (
    <div className="space-y-4 py-6" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-4 w-72 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    </div>
  );
}
// Calendly page header: bold title, optional description and actions, optional underline tabs below
export function PageHeader({ title, description, actions, children, className }) {
  return (
    <div className={cn('mb-6', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight leading-tight">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

// Underline tabs (Calendly's "Event types | Single-use links" row). tabs: [{ value, label, count? }]
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cn('mt-5 flex gap-6 overflow-x-auto no-scrollbar border-b border-border', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-1 text-sm font-semibold transition-all duration-200',
              active ? 'border-primary text-link' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cn('rounded-full px-1.5 text-xs tabular', active ? 'bg-primary-soft text-link' : 'bg-secondary text-muted-foreground')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Round avatar with initials fallback
export function Avatar({ src, name, size = 40, className }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <div
      className={cn('shrink-0 overflow-hidden rounded-full bg-primary-soft text-link flex items-center justify-center font-bold', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </div>
  );
}
