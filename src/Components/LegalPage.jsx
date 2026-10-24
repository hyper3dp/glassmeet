import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { LEGAL } from '@/lib/legal';

// Shared layout for the Privacy Policy and Terms of Service.
// `sections` is [{ id, title, body }]; each id becomes an anchor in the table of contents.
export default function LegalPage({ title, intro, sections, otherDoc }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            {LEGAL.appName}
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-all duration-200 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="mb-10 max-w-2xl">
          <p className="meta-label mb-3">Legal</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Effective {LEGAL.effectiveDate}</p>
          {intro && <p className="mt-6 leading-relaxed text-muted-foreground">{intro}</p>}
        </div>

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="hidden lg:sticky lg:top-8 lg:block lg:self-start">
            <p className="meta-label mb-3">On this page</p>
            <ol className="space-y-0.5 text-sm">
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex rounded-lg px-2 py-1.5 text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"
                  >
                    <span className="mr-2 w-5 shrink-0 tabular-nums text-hint">{i + 1}.</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="matte rounded-2xl border border-border p-6 sm:p-8">
            {sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-8 border-b border-border py-8 first:pt-0 last:border-0 last:pb-0"
              >
                <h2 className="mb-4 text-lg font-semibold tracking-tight">
                  <span className="mr-2 tabular-nums text-hint">{i + 1}.</span>
                  {section.title}
                </h2>
                <div className="legal-prose">{section.body}</div>
              </section>
            ))}
          </article>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <span>
            Questions? Email{' '}
            <a href={`mailto:${LEGAL.contactEmail}`} className="text-foreground underline underline-offset-4">
              {LEGAL.contactEmail}
            </a>
          </span>
          <Link to={otherDoc.to} className="inline-flex items-center gap-1.5 text-foreground transition-all duration-200 hover:opacity-80">
            {otherDoc.label} <ArrowRight className="h-4 w-4" />
          </Link>
        </footer>
      </main>
    </div>
  );
}
