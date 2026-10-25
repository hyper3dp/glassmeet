// Shared iCalendar (RFC 5545) text helpers for the .ics files GlassMeet builds in the browser.
// supabase/functions/calendar-feed/index.ts has the same rules for the subscription feed.

// TEXT values: escape backslash, ; and , and turn any line break (\r\n, \n or a lone \r) into
// \n; other control characters are dropped so guest-typed text can't break the file's lines.
export const icsText = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n')
  // eslint-disable-next-line no-control-regex
  .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

// Parameter values (CN=...): no backslash escapes exist there, so quote them and drop the
// characters a quoted value can't hold.
// eslint-disable-next-line no-control-regex
export const icsParam = (value) => `"${String(value ?? '').replace(/["\x00-\x1f\x7f]/g, '')}"`;

const encoder = new TextEncoder();

// Lines longer than 75 octets (UTF-8 bytes, not characters) fold with CRLF + space, never
// splitting a character (emoji included).
export const icsFold = (line) => {
  if (encoder.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (encoder.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
};
