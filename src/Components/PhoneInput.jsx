import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIMITS, onlyPhone } from '@/lib/inputRules';
import { COUNTRIES, dialCode, guessCountry, splitPhone, joinPhone, phoneProblem, examplePhone, isValidPhone } from '@/lib/phone';

// WhatsApp number field: a country picker ("+971") and the local number in one box. `value` and
// onChange carry the whole international number ("+971501234567", or '' when empty). A number
// that isn't a real mobile number for the country says so once the person leaves the field.
// The picker is a native <select> laid over the dial code: phones get their own wheel or sheet,
// and desktop browsers let you type a country's name to jump to it.
export default function PhoneInput({ id, value, onChange, hint, invalid, className, ...props }) {
  const [initial] = useState(() => splitPhone(value, guessCountry()));
  const [country, setCountry] = useState(initial.country);
  const [national, setNational] = useState(initial.national);
  const [touched, setTouched] = useState(false);
  const sent = useRef(value || '');

  // the page changed the number itself (filled in from an account, cleared): show that instead
  if ((value || '') !== sent.current) {
    sent.current = value || '';
    const next = splitPhone(value, country);
    if (next.country !== country) setCountry(next.country);
    if (next.national !== national) setNational(next.national);
  }

  const emit = (c, n) => {
    const number = joinPhone(c, n);
    sent.current = number;
    onChange?.(number);
  };

  const onType = (e) => {
    const typed = onlyPhone(e.target.value);
    // a pasted international number moves the picker to its country
    if (/^(\+|00)/.test(typed.trim())) {
      const split = splitPhone(typed, country);
      if (split.country !== country && dialCode(split.country)) {
        setCountry(split.country);
        setNational(split.national);
        emit(split.country, split.national);
        return;
      }
    }
    setNational(typed);
    emit(country, typed);
  };

  const onPick = (e) => {
    setCountry(e.target.value);
    emit(e.target.value, national);
  };

  // tidy a good number into the country's usual spacing ("050 123 4567")
  const onBlur = () => {
    setTouched(true);
    const number = joinPhone(country, national);
    if (isValidPhone(number)) setNational(splitPhone(number, country).national);
  };

  const problem = touched ? phoneProblem(joinPhone(country, national), country) : '';
  const placeholder = useMemo(() => examplePhone(country), [country]);
  const hintId = `${id}-hint`;

  return (
    <div className={className}>
      <div
        aria-invalid={!!(problem || invalid)}
        className="flex h-11 w-full rounded-lg border border-input bg-field transition-all duration-200 hover:border-border-hover focus-within:border-ring focus-within:ring-1 focus-within:ring-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
      >
        <div className="relative flex shrink-0 items-center gap-1 border-r border-input pl-3.5 pr-2.5 text-base sm:text-sm text-foreground">
          <span aria-hidden="true" className="font-semibold">{country}</span>
          <span aria-hidden="true" className="text-muted-foreground">+{dialCode(country)}</span>
          <ChevronDown aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          <select
            id={`${id}-country`}
            value={country}
            onChange={onPick}
            aria-label="Country code"
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          >
            {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.name} (+{c.code})</option>)}
          </select>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={LIMITS.phone}
          value={national}
          onChange={onType}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-invalid={!!(problem || invalid)}
          aria-describedby={problem || hint ? hintId : undefined}
          className="min-w-0 flex-1 rounded-r-lg bg-transparent px-3 text-base sm:text-sm text-foreground outline-none placeholder:text-hint"
          {...props}
        />
      </div>
      {(problem || hint) && (
        <p id={hintId} className={cn('mt-1.5 text-xs', problem ? 'text-destructive' : 'text-muted-foreground')}>{problem || hint}</p>
      )}
    </div>
  );
}
