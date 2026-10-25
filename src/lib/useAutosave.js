import { useEffect, useRef, useState } from 'react';

// Saves `value` with `save(value)` a short while after it stops changing.
// Skips the first render (the loaded value) and returns 'idle' | 'saving' | 'saved' | 'error'.
// A change still waiting when the component goes away (page change, dialog closed) is saved
// right then instead of being dropped.
export function useAutosave(value, save, { delay = 800, enabled = true } = {}) {
  const [state, setState] = useState('idle');
  const first = useRef(true);
  const latest = useRef(save);
  latest.current = save;
  const pending = useRef(null); // serialized value not yet handed to save()
  const serialized = JSON.stringify(value);

  useEffect(() => {
    if (!enabled) return undefined;
    if (first.current) { first.current = false; return undefined; }
    setState('saving');
    pending.current = serialized;
    const t = setTimeout(async () => {
      pending.current = null;
      try {
        await latest.current(JSON.parse(serialized));
        setState('saved');
      } catch {
        setState('error');
      }
    }, delay);
    return () => clearTimeout(t);
  }, [serialized, enabled, delay]);

  useEffect(() => () => {
    if (pending.current !== null) latest.current(JSON.parse(pending.current)).catch(() => {});
  }, []);

  return state;
}

export default useAutosave;
