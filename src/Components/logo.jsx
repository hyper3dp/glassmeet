import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// GlassMeet wordmark: blue tile + name. `to` makes it a link.
export default function Logo({ to, className, size = 'md' }) {
  const tile = size === 'sm' ? 'w-7 h-7 rounded-md' : 'w-8 h-8 rounded-lg';
  const icon = size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]';
  const content = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn(tile, 'bg-primary text-primary-foreground flex items-center justify-center')}>
        <CalendarCheck className={icon} strokeWidth={2.25} />
      </span>
      <span className={cn('font-bold tracking-tight text-foreground', size === 'sm' ? 'text-base' : 'text-lg')}>GlassMeet</span>
    </span>
  );
  return to ? <Link to={to} aria-label="GlassMeet home">{content}</Link> : content;
}
