import React, { useEffect, useState } from 'react';
import { MapPin, Pencil, Trash2, Plus, Check, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/localApi';
import { GlassButton, GlassInput, GlassTextarea, GlassLabel } from '@/components/glass';

const ADDRESS_MAX = 300;

// Saved places a host meets guests at; in-person event types pick from these.
export default function AddressManager() {
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // id, 'new' or null

  useEffect(() => {
    api.entities.Address.filter({}, 'created_date')
      .then((list) => { setItems(list); setState('ready'); })
      .catch((e) => {
        setError(/addresses|schema cache|relation/i.test(e.message) ? 'Saved addresses are not set up on the server yet.' : e.message);
        setState('error');
      });
  }, []);

  const save = async (id, values) => {
    if (id === 'new') {
      const created = await api.entities.Address.create(values);
      setItems((list) => [...list, created]);
    } else {
      const updated = await api.entities.Address.update(id, values);
      setItems((list) => list.map((a) => (a.id === id ? (updated || { ...a, ...values }) : a)));
    }
    setEditing(null);
  };

  const remove = async (id) => {
    if (!confirm('Delete this address? Event types already using it keep their copy.')) return;
    setItems((list) => list.filter((a) => a.id !== id));
    try { await api.entities.Address.delete(id); } catch (e) { setError(e.message); }
  };

  if (state === 'loading') return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading addresses…</div>;
  if (state === 'error') return <p role="alert" className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-3">
      {items.length === 0 && editing !== 'new' && (
        <p className="rounded-lg bg-secondary px-4 py-5 text-center text-sm text-muted-foreground">No saved addresses yet. Add the places you meet guests.</p>
      )}
      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((a) => (
            <li key={a.id} className="p-4">
              {editing === a.id ? (
                <AddressForm initial={a} onCancel={() => setEditing(null)} onSave={(v) => save(a.id, v)} />
              ) : (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{a.label || 'Address'}</div>
                    <div className="text-sm text-muted-foreground whitespace-pre-line break-words">{a.address}</div>
                  </div>
                  <button type="button" onClick={() => setEditing(a.id)} aria-label={`Edit ${a.label || 'address'}`} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => remove(a.id)} aria-label={`Delete ${a.label || 'address'}`} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing === 'new' ? (
        <div className="rounded-lg border border-border p-4">
          <AddressForm onCancel={() => setEditing(null)} onSave={(v) => save('new', v)} />
        </div>
      ) : (
        <GlassButton type="button" onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> Add address</GlassButton>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function AddressForm({ initial, onSave, onCancel }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!address.trim()) { setError('Enter the address.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSave({ label: label.trim(), address: address.trim() });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <GlassLabel htmlFor={`addr-label-${initial?.id || 'new'}`}>Label</GlassLabel>
        <GlassInput id={`addr-label-${initial?.id || 'new'}`} maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Office, Clinic, Home studio" />
      </div>
      <div>
        <GlassLabel htmlFor={`addr-text-${initial?.id || 'new'}`}>Address</GlassLabel>
        <GlassTextarea id={`addr-text-${initial?.id || 'new'}`} rows={2} maxLength={ADDRESS_MAX} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, building, city" required />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <GlassButton type="button" variant="ghost" onClick={onCancel}><X className="w-4 h-4" /> Cancel</GlassButton>
        <GlassButton type="submit" variant="primary" disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save address</GlassButton>
      </div>
    </form>
  );
}
