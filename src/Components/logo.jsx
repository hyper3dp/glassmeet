import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import markUrl from '@/assets/brand/mark.png';
import wordUrl from '@/assets/brand/wordmark-text.png';

// The brand kit's art is used as alpha masks so it can be tinted per theme:
// the mark stays brand teal, the lettering follows the text colour (slate on light, near-white on dark).
const maskStyle = (url) => ({
  WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`,
  WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
  WebkitMaskSize: 'contain', maskSize: 'contain',
  WebkitMaskPosition: 'center', maskPosition: 'center',
});

export function LogoMark({ size = 32, className, tone = 'bg-brand-teal' }) {
  return <span aria-hidden="true" className={cn('inline-block shrink-0', tone, className)} style={{ width: size, height: size, ...maskStyle(markUrl) }} />;
}

// Lockup proportions follow the kit: lettering is 0.66x the mark's height, gap 0.28x.
export default function Logo({ to, className, size = 'md', textTone = 'bg-foreground', markTone }) {
  const h = size === 'sm' ? 26 : size === 'lg' ? 44 : 32;
  const content = (
    <span className={cn('inline-flex items-center', className)} style={{ gap: Math.round(h * 0.28) }}>
      <LogoMark size={h} tone={markTone} />
      <span aria-hidden="true" className={cn('inline-block', textTone)} style={{ height: Math.round(h * 0.66), width: Math.round(h * 0.66 * (915 / 148)), ...maskStyle(wordUrl) }} />
      <span className="sr-only">GlassMeet</span>
    </span>
  );
  return to ? <Link to={to} aria-label="GlassMeet home" className="inline-flex">{content}</Link> : content;
}
