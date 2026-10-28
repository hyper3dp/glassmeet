import React, { useEffect, useId, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// GlassSelect's styled menu for mouse-and-keyboard browsers (see glass.jsx). It lives in its own
// chunk with Radix Popover, so phones, which keep the native picker, never download either.

const FIELD = 'flex h-11 w-full cursor-pointer items-center rounded-lg border border-input bg-field pl-3.5 text-base sm:text-sm text-foreground transition-all duration-200 hover:border-border-hover focus:border-ring focus:ring-1 focus:ring-ring focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50';
const textOf = (node) => (node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(textOf).join('') : typeof node === 'object' ? textOf(node.props?.children) : String(node));

// Listbox in a popover. Focus stays on the button (aria-activedescendant), so the label's
// htmlFor, Tab order and the dialog focus trap behave as with a native select.
export default function SelectMenu({ id, value, onChange, disabled, className, children, 'aria-label': ariaLabel }) {
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
