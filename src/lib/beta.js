import { useSyncExternalStore } from 'react';

// Hidden beta features. Tapping "Coming soon" in Settings five times unlocks the Beta features
// menu, where each feature has its own switch. Kept per browser; the menu can be hidden again.
export const BETA_FEATURES = [
  { id: 'embed', name: 'Add to website', body: 'Put a booking button, pop-up or link for any event type on your own website. Find it in each event type’s menu.' },
  { id: 'countdown', name: 'Next meeting countdown', body: 'See how long until your next meeting at the top of every page, with a Join button when it’s about to start. Works straight away, with nothing to set up.' },
];

const KEY = 'gm-beta';
const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};

let state = read();
const listeners = new Set();
const write = (next) => {
  state = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable: lasts until reload */ }
  listeners.forEach((l) => l());
};

// other tabs follow along
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { state = read(); listeners.forEach((l) => l()); }
  });
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

// features start on when the menu is unlocked
export const unlockBeta = () => write({ ...Object.fromEntries(BETA_FEATURES.map((f) => [f.id, true])), ...state, unlocked: true });
export const hideBeta = () => write(null);
export const setBetaFeature = (id, on) => write({ ...state, [id]: on });

export const useBeta = () => useSyncExternalStore(subscribe, () => state);
// on unless switched off, so a feature added after the menu was unlocked starts on too
export const betaFeatureOn = (beta, id) => !!beta?.unlocked && beta[id] !== false;
export const useBetaFeature = (id) => {
  const beta = useBeta();
  return betaFeatureOn(beta, id);
};
