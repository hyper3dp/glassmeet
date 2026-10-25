import React, { useState } from 'react';
import { QrCode, Download, Copy, Check, X } from 'lucide-react';
import { GlassButton } from '@/components/glass';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * QR Code component for booking pages.
 * Uses the qrserver.com public API to generate QR code images.
 * Shows a modal with the QR code, download, and copy link options.
 */
export default function QRCodeModal({ url, open, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}&margin=10`;

  const download = () => {
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = 'glassmeet-qr.png';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-sm p-6 text-center block">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-link" />
            <DialogTitle>QR Code</DialogTitle>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 mb-4 inline-block">
          <img src={qrUrl} alt="QR Code" width={220} height={220} className="rounded-md" />
        </div>

        <p className="text-xs text-muted-foreground mb-4 break-all">{url}</p>

        <div className="flex gap-2">
          <GlassButton size="sm" className="flex-1" onClick={download}>
            <Download className="w-4 h-4" /> Download
          </GlassButton>
          <GlassButton size="sm" variant="primary" className="flex-1" onClick={copyLink}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy Link'}
          </GlassButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}