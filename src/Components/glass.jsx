import React, { useEffect, useId, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Minus, Plus } from 'lucide-react';
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
  return <Input className={cn('h-11 px-3.5 text-base sm:text-sm', className)} {...props} />;
}

export function GlassTextarea({ className, ...props }) {
  return <Textarea className={cn('px-3.5 py-3 text-base sm:text-sm resize-none', className)} {...props} />;
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

// Chevron drawn in the muted slate, which reads on both themes' fields
const SELECT_CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23708aa6' stroke-width='2.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

// Phones and tablets keep the native picker (wheel or sheet); mouse-and-keyboard browsers get
// a styled menu. Pages pass <option> children and read e.target.value either way.
const finePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

export function GlassSelect(props) {
  const [menu] = useState(finePointer);
  return menu ? <SelectMenu {...props} /> : <NativeSelect {...props} />;
}

const FIELD = 'flex h-11 w-full cursor-pointer items-center rounded-lg border border-input bg-field pl-3.5 text-base sm:text-sm text-foreground transition-all duration-200 hover:border-border-hover focus:border-ring focus:ring-1 focus:ring-ring focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50';
const textOf = (node) => (node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(textOf).join('') : typeof node === 'object' ? textOf(node.props?.children) : String(node));

// Listbox in a popover. Focus stays on the button (aria-activedescendant), so the label's
// htmlFor, Tab order and the dialog focus trap behave as with a native select.
function SelectMenu({ id, value, onChange, disabled, className, children, 'aria-label': ariaLabel }) {
  const options = React.Children.toArray(children)
    .filter((c) => c?.type === 'option')
    .map((c) => ({ value: String(c.props.value ?? ''), label: c.props.children, disabled: !!c.props.disabled }));
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const selected = options.findIndex((o) => o.value === String(value ?? ''));

  useEffect(() => { if (open) setActive(Math.max(0, selected)); }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (i) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange?.({ target: { value: o.value } });
    setOpen(false);
  };
  // next enabled option from i in direction dir (stays put at either end)
  const step = (i, dir) => {
    for (let j = i + dir; j >= 0 && j < options.length; j += dir) if (!options[j].disabled) return j;
    return i;
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    const moves = {
      ArrowDown: () => step(active, 1), ArrowUp: () => step(active, -1),
      Home: () => step(-1, 1), End: () => step(options.length, -1),
      PageDown: () => Math.min(options.length - 1, active + 8), PageUp: () => Math.max(0, active - 8),
    };
    if (moves[e.key]) { e.preventDefault(); setActive(moves[e.key]()); }
    else if (e.key === 'Enter' || (e.key === ' ' && Date.now() - typed.current.at > 700)) { e.preventDefault(); choose(active); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // type to jump: letters typed in quick succession build up a prefix
      const now = Date.now();
      const text = (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase();
      typed.current = { text, at: now };
      const from = text.length === 1 ? active + 1 : active;
      const order = [...options.keys()].map((k) => (k + from + options.length) % options.length);
      const hit = order.find((k) => !options[k].disabled && textOf(options[k].label).trim().toLowerCase().startsWith(text));
      if (hit !== undefined) setActive(hit);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          id={id} type="button" role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
          aria-controls={open ? `${uid}-list` : undefined}
          aria-activedescendant={open && active >= 0 ? `${uid}-${active}` : undefined}
          onKeyDown={onKeyDown}
          className={cn(FIELD, 'justify-between gap-2 pr-3 text-left data-[state=open]:border-ring data-[state=open]:ring-1 data-[state=open]:ring-ring', className)}
        >
          <span className={cn('truncate', !options[selected]?.value && 'text-muted-foreground')}>{options[selected]?.label ?? ''}</span>
          <ChevronDown className={cn('w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start" sideOffset={6} collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{ minWidth: 'var(--radix-popover-trigger-width)' }}
          className="z-[60] max-w-[min(28rem,calc(100vw-24px))] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-pop outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <ul id={`${uid}-list`} role="listbox" ref={listRef} aria-label={ariaLabel} className="max-h-72 overflow-y-auto">
            {options.map((o, i) => (
              <li
                key={`${o.value}-${i}`} id={`${uid}-${i}`} data-index={i} role="option"
                aria-selected={i === selected} aria-disabled={o.disabled || undefined}
                onPointerMove={() => { if (!o.disabled && active !== i) setActive(i); }}
                onClick={() => choose(i)}
                className={cn(
                  'flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200',
                  i === active && 'bg-secondary',
                  i === selected ? 'font-semibold text-link' : 'text-foreground',
                  o.disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="min-w-0">{o.label}</span>
                {i === selected && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Native <select> styled like the menu's button
function NativeSelect({ className, children, ...props }) {
  return (
    <select
      style={{ backgroundImage: SELECT_CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.85rem center', backgroundSize: '1rem' }}
      className={cn('flex h-11 w-full cursor-pointer appearance-none rounded-lg border border-input bg-field pl-3.5 pr-10 text-base sm:text-sm text-foreground transition-all duration-200 hover:border-border-hover focus:border-ring focus:ring-1 focus:ring-ring focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    >
      {children}
    </select>
  );
}

// Number field with minus and plus buttons. While typing, value may be a string (or empty); it is
// rounded to the step and kept between min and max when the field loses focus. Arrow keys step.
export function Stepper({ id, value, onChange, min = 0, max = 9999, step = 1, suffix, className, 'aria-label': ariaLabel }) {
  const n = value === '' ? NaN : Number(value);
  const clamp = (v) => Math.min(max, Math.max(min, Math.round((Number.isFinite(v) ? v : min) / step) * step));
  const bump = (dir) => onChange(clamp((Number.isFinite(n) ? n : min) + dir * step));
  const btn = 'w-10 shrink-0 flex items-center justify-center text-link transition-all duration-200 hover:bg-primary-soft disabled:text-hint disabled:hover:bg-transparent';
  return (
    <div className={cn('inline-flex h-11 items-stretch overflow-hidden rounded-lg border border-input bg-field transition-all duration-200 hover:border-border-hover focus-within:border-ring focus-within:ring-1 focus-within:ring-ring', className)}>
      <button type="button" tabIndex={-1} aria-label="Decrease" onClick={() => bump(-1)} disabled={n <= min} className={btn}><Minus className="w-4 h-4" /></button>
      <span className="flex flex-1 items-center justify-center gap-1 px-1">
        <input
          id={id} type="text" inputMode="numeric" role="spinbutton" aria-label={ariaLabel}
          aria-valuemin={min} aria-valuemax={max} aria-valuenow={Number.isFinite(n) ? n : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          onBlur={() => onChange(clamp(n))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); }
          }}
          className="min-w-0 bg-transparent text-center text-base sm:text-sm font-semibold tabular text-foreground outline-none"
          style={{ width: `${Math.max(2, String(value).length) + 1}ch` }}
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </span>
      <button type="button" tabIndex={-1} aria-label="Increase" onClick={() => bump(1)} disabled={n >= max} className={btn}><Plus className="w-4 h-4" /></button>
    </div>
  );
}

// Every 15 minutes, value "HH:MM", label "9:00am" as Calendly writes it
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4), m = (i % 4) * 15;
  return {
    value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    label: `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`,
  };
});

// The one time picker used everywhere (native select: opens the wheel on phones).
// placeholder adds an empty choice for optional times.
export function TimeSelect({ value, onChange, placeholder, className, ...props }) {
  const v = (value || '').slice(0, 5);
  const known = TIME_OPTIONS.some((o) => o.value === v);
  return (
    <GlassSelect value={v} onChange={(e) => onChange(e.target.value)} className={cn('tabular', className)} {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {!known && v && <option value={v}>{v}</option>}
      {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </GlassSelect>
  );
}

// "Saving… / Saved" line shown next to autosaving forms
export function SaveStatus({ state }) {
  if (state === 'idle') return null;
  return (
    <span role="status" className={cn('inline-flex items-center gap-1.5 text-sm', state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
      {state === 'saving' ? 'Saving…' : state === 'error' ? 'Could not save' : 'All changes saved'}
    </span>
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
