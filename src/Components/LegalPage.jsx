import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { LEGAL } from '@/lib/legal';
import Logo from '@/components/logo.jsx';

// The contact addresses as mailto links: "a@x.com or b@y.com".
export function ContactEmails({ className }) {
  return LEGAL.contactEmails.map((email, i) => (
    <React.Fragment key={email}>
      {i > 0 && ' or '}
      <a href={`mailto:${email}`} className={className}>{email}</a>
    </React.Fragment>
  ));
}

// Shared layout for the Privacy Policy and Terms of Service.
// `sections` is [{ id, title, body }]; each id becomes an anchor in the table of contents.
export default function LegalPage({ title, intro, sections, otherDoc }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo to="/" />
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-all duration-200 hover:text-link">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-[40px] sm:leading-tight">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Effective {LEGAL.effectiveDate}</p>
          {intro && <p className="mt-6 text-[17px] leading-relaxed text-muted-foreground">{intro}</p>}
        </div>

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            <p className="mb-3 px-2 text-sm font-bold">On this page</p>
            <ol className="space-y-0.5 text-sm">
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex rounded-md px-2 py-1.5 font-semibold text-muted-foreground transition-all duration-200 hover:bg-primary-soft hover:text-link"
                  >
                    <span className="mr-2 w-5 shrink-0 tabular text-hint">{i + 1}.</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="max-w-[720px] rounded-xl border border-border bg-card p-6 shadow-card sm:p-10">
            {sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 border-b border-border py-8 first:pt-0 last:border-0 last:pb-0"
              >
                <h2 className="mb-4 text-xl font-bold">
                  <span className="mr-2 tabular text-hint">{i + 1}.</span>
                  {section.title}
                </h2>
                <div className="legal-prose">{section.body}</div>
              </section>
            ))}
          </article>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <span>
            Questions? Email <ContactEmails className="font-semibold text-link hover:underline" />
          </span>
          <Link to={otherDoc.to} className="inline-flex items-center gap-1.5 font-semibold text-link transition-all duration-200 hover:underline">
            {otherDoc.label} <ArrowRight className="h-4 w-4" />
          </Link>
        </footer>
      </main>
    </div>
  );
}
