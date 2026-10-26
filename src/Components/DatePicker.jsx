import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import { GlassInput } from '@/components/glass';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Phones and tablets have good native date pickers; mouse-and-keyboard browsers (Windows in
// particular) get this month grid instead.
const prefersNative = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// value / min: "YYYY-MM-DD"
export default function DatePicker({ id, value, onChange, min, className }) {
  const [native] = useState(prefersNative);
  if (native) {
    return (
      <GlassInput
        id={id} type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} required
        className={cn('block appearance-none text-left leading-[2.75rem] [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:m-0', className)}
      />
    );
  }
  return <MonthPicker id={id} value={value} onChange={onChange} min={min} className={className} />;
}

function MonthPicker({ id, value, onChange, min, className }) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromKey(value) : null;
  const [focused, setFocused] = useState(() => selected || new Date());
  const gridRef = useRef(null);

  useEffect(() => { if (open) setFocused(selected || (min ? fromKey(min) : new Date())); }, [open]);
  // keep keyboard focus on the focused day as it moves
  useEffect(() => {
    if (open) gridRef.current?.querySelector(`[data-day="${toKey(focused)}"]`)?.focus();
  }, [focused, open]);

  const days = useMemo(() => {
    const first = new Date(focused.getFullYear(), focused.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [focused.getFullYear(), focused.getMonth()]);

  const isDisabled = (d) => !!min && toKey(d) < min;
  const pick = (d) => { if (isDisabled(d)) return; onChange(toKey(d)); setOpen(false); };
  const shiftMonth = (n) => setFocused((f) => {
    const d = new Date(f.getFullYear(), f.getMonth() + n, 1);
    return new Date(d.getFullYear(), d.getMonth(), Math.min(f.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  });
  const prevDisabled = !!min && toKey(new Date(focused.getFullYear(), focused.getMonth(), 0)) < min;

  const onKeyDown = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[e.key]) { e.preventDefault(); setFocused((f) => addDays(f, moves[e.key])); }
    else if (e.key === 'PageUp') { e.preventDefault(); shiftMonth(-1); }
    else if (e.key === 'PageDown') { e.preventDefault(); shiftMonth(1); }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id} type="button"
          className={cn('flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-field px-3.5 text-left text-base sm:text-sm text-foreground transition-all duration-200 outline-none hover:border-border-hover focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=open]:border-primary', className)}
        >
          <span className={selected ? '' : 'text-hint'}>
            {selected ? selected.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'}
          </span>
          <CalendarDays className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start" sideOffset={6} collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[60] w-[300px] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-pop outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} disabled={prevDisabled} aria-label="Previous month"
              className="w-8 h-8 rounded-full flex items-center justify-center text-link transition-all duration-200 hover:bg-primary-soft disabled:text-hint disabled:hover:bg-transparent">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-bold" aria-live="polite">
              {focused.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </div>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
              className="w-8 h-8 rounded-full flex items-center justify-center text-link transition-all duration-200 hover:bg-primary-soft">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div role="grid" ref={gridRef} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="pb-1 text-[11px] font-semibold uppercase text-muted-foreground">{w}</div>)}
            {days.map((d) => {
              const key = toKey(d);
              const outside = d.getMonth() !== focused.getMonth();
              const isSelected = value === key;
              const isToday = key === toKey(new Date());
              const disabled = isDisabled(d);
              return (
                <div key={key} role="gridcell" className="flex justify-center">
                  <button
                    type="button" data-day={key} disabled={disabled} aria-selected={isSelected}
                    aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    tabIndex={key === toKey(focused) ? 0 : -1}
                    onClick={() => pick(d)}
                    className={cn(
                      'relative w-9 h-9 rounded-full text-sm tabular transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected ? 'bg-primary text-primary-foreground font-bold'
                        : disabled ? 'text-hint/60 cursor-not-allowed'
                        : outside ? 'text-hint hover:bg-secondary'
                        : 'font-semibold text-link bg-primary-soft hover:bg-primary hover:text-primary-foreground',
                    )}
                  >
                    {d.getDate()}
                    {isToday && !isSelected && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current" aria-hidden="true" />}
                  </button>
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Inline month grid where each click adds or removes a day. value: sorted "YYYY-MM-DD" keys.
export function MultiDatePicker({ value, onChange, min, labelledBy }) {
  const [focused, setFocused] = useState(() => (value[0] ? fromKey(value[0]) : new Date()));
  const gridRef = useRef(null);
  const keyed = useRef(false); // focus follows the arrow keys only, not clicks or month buttons
  useEffect(() => {
    if (keyed.current) gridRef.current?.querySelector(`[data-day="${toKey(focused)}"]`)?.focus();
    keyed.current = false;
  }, [focused]);

  const days = useMemo(() => {
    const first = new Date(focused.getFullYear(), focused.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [focused.getFullYear(), focused.getMonth()]);

  const isDisabled = (d) => !!min && toKey(d) < min;
  const toggle = (d) => {
    if (isDisabled(d)) return;
    const key = toKey(d);
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key].sort());
    setFocused(d);
  };
  const shiftMonth = (n) => setFocused((f) => new Date(f.getFullYear(), f.getMonth() + n, 1));
  const prevDisabled = !!min && toKey(new Date(focused.getFullYear(), focused.getMonth(), 0)) < min;

  const onKeyDown = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!moves[e.key]) return;
    e.preventDefault();
    keyed.current = true;
    setFocused((f) => addDays(f, moves[e.key]));
  };

  return (
    <div className="w-full max-w-[320px]">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} disabled={prevDisabled} aria-label="Previous month"
          className="w-8 h-8 rounded-full flex items-center justify-center text-link transition-all duration-200 hover:bg-primary-soft disabled:text-hint disabled:hover:bg-transparent">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-bold" aria-live="polite">
          {focused.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
          className="w-8 h-8 rounded-full flex items-center justify-center text-link transition-all duration-200 hover:bg-primary-soft">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div role="grid" aria-labelledby={labelledBy} aria-multiselectable="true" ref={gridRef} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="pb-1 text-[11px] font-semibold text-muted-foreground">{w}</div>)}
        {days.map((d) => {
          const key = toKey(d);
          const outside = d.getMonth() !== focused.getMonth();
          const isSelected = value.includes(key);
          const disabled = isDisabled(d);
          return (
            <div key={key} role="gridcell" className="flex justify-center">
              <button
                type="button" data-day={key} disabled={disabled} aria-selected={isSelected}
                aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                tabIndex={key === toKey(focused) ? 0 : -1}
                onClick={() => toggle(d)}
                className={cn(
                  'w-9 h-9 rounded-full text-sm tabular transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected ? 'bg-primary text-primary-foreground font-bold'
                    : disabled ? 'text-hint/60 cursor-not-allowed'
                    : outside ? 'text-hint hover:bg-secondary'
                    : 'font-semibold text-foreground hover:bg-primary-soft hover:text-link',
                )}
              >
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
