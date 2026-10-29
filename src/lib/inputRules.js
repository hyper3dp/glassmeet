// What each kind of text box accepts. Characters outside the set are dropped as they're typed or
// pasted, so nobody gets an error for a stray symbol. Letters cover every language (Arabic, Urdu,
// accented names), not just A–Z. Free text (descriptions, notes, messages, templates) keeps its
// punctuation and only has a length limit (maxLength on the field).

export const LIMITS = {
  name: 80,
  title: 80,
  label: 40,
  email: 254,
  phone: 24,
  url: 500,
  password: 72, // what Supabase Auth (bcrypt) reads
  answer: 500,
  note: 2000,
  search: 100,
};

// people's names: letters, spaces, and . ' ’ - (Mary-Jane, O'Brien, J. Smith)
export const onlyName = (v) => v.replace(/[^\p{L}\p{M}\s.'’-]/gu, '');

// event names, place and address labels, button text: also numbers and everyday punctuation
export const onlyTitle = (v) => v.replace(/[^\p{L}\p{M}\p{N}\s.,'’&()/:#+!?-]/gu, '');

// phone numbers: digits, a leading +, spaces, dashes and brackets
export const onlyPhone = (v) => v.replace(/[^\d+\s()-]/g, '');

// emails: no spaces, and none of the characters an address can't contain
export const onlyEmail = (v) => v.replace(/[\s<>()[\]\\,;:"]/g, '');
