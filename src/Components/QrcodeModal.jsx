import React, { useState } from 'react';
import { QrCode, Download, Copy, Check, X } from 'lucide-react';
import { GlassButton } from '@/components/glass';

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" />
      <div className="glass-panel w-full max-w-sm p-6 animate-scale-in text-center relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 accent-text" />
            <h2 className="font-semibold">QR Code</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg glass flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="glass rounded-2xl p-4 mb-4 inline-block">
          <img src={qrUrl} alt="QR Code" width={220} height={220} className="rounded-xl" />
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
      </div>
    </div>
  );
}