import React from "react";
import Logo from "@/components/logo.jsx";

// Calendly-style auth frame: logo, bold heading, one card. `icon` is accepted for older callers and not drawn.
export default function AuthLayout({ icon: _icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex flex-col items-center bg-background px-4 py-10 sm:py-16">
      <Logo to="/" />
      <div className="w-full max-w-[440px] mt-10">
        <div className="text-center mb-8">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2 text-[15px]">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-xl border border-border shadow-card p-6 sm:p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
