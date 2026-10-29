import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { GlassButton, GlassInput, GlassLabel, GlassSelect } from '@/components/glass';
import { appPath } from '@/lib/authReturnTo';
import { bookingUrlFor } from '@/components/eventcard.jsx';
import { LIMITS, onlyTitle } from '@/lib/inputRules';

const MODES = [
  { value: 'inline', label: 'Inline', hint: 'The calendar sits inside your page and grows to fit.' },
  { value: 'button', label: 'Floating button', hint: 'A button in the bottom corner of every page opens the calendar.' },
  { value: 'link', label: 'Pop-up link', hint: 'Your own link or button opens the calendar in a pop-up.' },
];

const scriptUrl = () => `${window.location.origin}${appPath('/embed.js')}`;

// Loads public/embed.js into this page once, so the host can try the pop-up here
const loadEmbedScript = () => new Promise((resolve, reject) => {
  if (window.GlassMeet) return resolve(window.GlassMeet);
  const s = document.createElement('script');
  s.src = scriptUrl();
  s.onload = () => resolve(window.GlassMeet);
  s.onerror = reject;
  document.head.appendChild(s);
});

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export default function EmbedDialog({ event, onClose }) {
  const [mode, setMode] = useState('inline');
  const [theme, setTheme] = useState('');
  const [text, setText] = useState('Book a meeting');
  const [color, setColor] = useState(event.color || '#2B7A75');
  const [copied, setCopied] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const url = bookingUrlFor(event.id);

  const code = useMemo(() => {
    const themeAttr = theme ? ` data-theme="${theme}"` : '';
    const tag = `<script src="${scriptUrl()}" async`;
    if (mode === 'inline') {
      return `<div class="glassmeet-inline" data-url="${url}"${themeAttr}></div>\n${tag}></script>`;
    }
    if (mode === 'button') {
      return `${tag}\n  data-button-url="${url}"\n  data-button-text="${escapeAttr(text || 'Book a meeting')}"\n  data-button-color="${color}"${themeAttr}></script>`;
    }
    return `<a href="${url}" data-glassmeet-popup="${url}"${themeAttr}>${escapeAttr(text || 'Book a meeting')}</a>\n${tag}></script>`;
  }, [mode, theme, text, color, url]);

  const copy = async () => {
    // copying can be refused (permissions, http): select the code instead of saying "Copied"
    try { await navigator.clipboard.writeText(code); } catch { document.getElementById('embed-code')?.select(); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // the dialog steps aside while the pop-up preview is open, and comes back when it closes
  const preview = async () => {
    try {
      const gm = await loadEmbedScript();
      setPreviewing(true);
      gm.open(url, { theme: theme || undefined, onClose: () => setPreviewing(false) });
    } catch {
      window.open(`${url}?embed=1`, '_blank', 'noopener');
    }
  };

  const pill = (m) => (
    <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => setMode(m.value)}
      className={`h-10 px-3 rounded-full border text-sm font-semibold transition-all duration-200 ${mode === m.value ? 'border-primary bg-primary-soft text-link' : 'border-input text-foreground hover:border-border-hover'}`}>
      {m.label}
    </button>
  );

  return (
    <Dialog open={!previewing} onOpenChange={(next) => { if (!next && !previewing) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-xl p-6 block">
        <div className="mb-1 flex items-center justify-between gap-3">
          <DialogTitle>Add to your website</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">Let visitors book <span className="font-semibold text-foreground">{event.name}</span> without leaving your site.</p>

        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">How it appears</legend>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2">{MODES.map(pill)}</div>
            <p className="mt-2 text-sm text-muted-foreground">{MODES.find((m) => m.value === mode).hint}</p>
          </fieldset>

          <div className={`grid gap-3 ${mode === 'inline' ? '' : 'sm:grid-cols-2'}`}>
            {mode !== 'inline' && (
              <div>
                <GlassLabel htmlFor="embed-text">{mode === 'button' ? 'Button text' : 'Link text'}</GlassLabel>
                <GlassInput id="embed-text" maxLength={LIMITS.label} value={text} onChange={(e) => setText(onlyTitle(e.target.value))} />
              </div>
            )}
            <div>
              <GlassLabel htmlFor="embed-theme">Theme</GlassLabel>
              <GlassSelect id="embed-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="">Match the visitor's device</option>
                <option value="light">Always light</option>
                <option value="dark">Always dark</option>
              </GlassSelect>
            </div>
          </div>
          {mode === 'button' && (
            <div className="flex items-center gap-3">
              <input id="embed-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-field p-1" />
              <label htmlFor="embed-color" className="text-sm font-semibold">Button colour</label>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <GlassLabel htmlFor="embed-code" className="mb-0">Code</GlassLabel>
              <span className="text-xs text-muted-foreground">Paste it into your site's HTML</span>
            </div>
            <textarea
              id="embed-code" readOnly value={code} rows={mode === 'button' ? 6 : 4} onFocus={(e) => e.target.select()}
              className="block w-full resize-none rounded-lg border border-input bg-secondary px-3.5 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <GlassButton type="button" onClick={preview}><Eye className="w-4 h-4" /> Preview</GlassButton>
            <GlassButton type="button" variant="primary" onClick={copy}>{copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy code</>}</GlassButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
