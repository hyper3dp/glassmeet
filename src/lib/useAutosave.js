import { useCallback, useEffect, useRef, useState } from 'react';

// Saves `value` with `save(value)` a short while after it stops changing.
// Skips the first render (the loaded value) and returns { state, error, retry }, where state is
// 'idle' | 'saving' | 'saved' | 'error' and error is the last failure's message.
// Saves run one at a time in the order they were made, so a slow save can't land after a newer
// one; only the newest save's result is shown.
// A change still waiting when the component goes away (page change, dialog closed) is saved
// right then instead of being dropped, and closing the tab while one waits asks first.
export function useAutosave(value, save, { delay = 800, enabled = true } = {}) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const first = useRef(true);
  const latest = useRef(save);
  latest.current = save;
  const pending = useRef(null); // serialized value not yet handed to save()
  const queue = useRef(Promise.resolve());
  const seq = useRef(0);
  const lastValue = useRef(null);
  const serialized = JSON.stringify(value);

  const run = useCallback((json) => {
    const mine = ++seq.current;
    lastValue.current = json;
    setState('saving');
    queue.current = queue.current.then(async () => {
      try {
        await latest.current(JSON.parse(json));
        if (mine === seq.current) { setError(''); setState('saved'); }
      } catch (e) {
        if (mine === seq.current) { setError(e?.message || ''); setState('error'); }
      }
    });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (first.current) { first.current = false; return undefined; }
    setState('saving');
    pending.current = serialized;
    const t = setTimeout(() => {
      pending.current = null;
      run(serialized);
    }, delay);
    return () => clearTimeout(t);
  }, [serialized, enabled, delay, run]);

  useEffect(() => {
    const warn = (e) => {
      if (pending.current === null) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (pending.current !== null) {
        const json = pending.current;
        queue.current = queue.current.then(() => latest.current(JSON.parse(json))).catch(() => {});
      }
    };
  }, []);

  const retry = useCallback(() => { if (lastValue.current !== null) run(lastValue.current); }, [run]);

  return { state, error, retry };
}

export default useAutosave;
