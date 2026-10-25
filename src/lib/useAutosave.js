import { useEffect, useRef, useState } from 'react';

// Saves `value` with `save(value)` a short while after it stops changing.
// Skips the first render (the loaded value) and returns 'idle' | 'saving' | 'saved' | 'error'.
export function useAutosave(value, save, { delay = 800, enabled = true } = {}) {
  const [state, setState] = useState('idle');
  const first = useRef(true);
  const latest = useRef(save);
  latest.current = save;
  const serialized = JSON.stringify(value);

  useEffect(() => {
    if (!enabled) return undefined;
    if (first.current) { first.current = false; return undefined; }
    setState('saving');
    const t = setTimeout(async () => {
      try {
        await latest.current(JSON.parse(serialized));
        setState('saved');
      } catch {
        setState('error');
      }
    }, delay);
    return () => clearTimeout(t);
  }, [serialized, enabled, delay]);

  return state;
}

export default useAutosave;
