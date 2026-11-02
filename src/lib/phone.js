// Phone numbers for WhatsApp: a country plus the local number, saved as one international
// number ("+971501234567"). The mobile build of libphonenumber-js knows each country's mobile
// ranges, so a landline or a number with a digit missing is caught before anyone relies on it.
import { parsePhoneNumberFromString, getCountries, getCountryCallingCode, getExampleNumber } from 'libphonenumber-js/mobile';
import examples from 'libphonenumber-js/mobile/examples';

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
export const countryName = (iso) => { try { return regionNames?.of(iso) || iso; } catch { return iso; } };

// every country WhatsApp numbers can come from, by name, with its dial code
export const COUNTRIES = getCountries()
  .map((iso) => ({ iso, code: getCountryCallingCode(iso), name: countryName(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name));
const byIso = new Map(COUNTRIES.map((c) => [c.iso, c]));
export const dialCode = (iso) => byIso.get(iso)?.code || '';

// the country this visitor is most likely dialling from: their time zone, then their language
const ZONE_COUNTRIES = {
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB', 'Asia/Baghdad': 'IQ', 'Asia/Jerusalem': 'IL',
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK',
  'Asia/Kathmandu': 'NP', 'Asia/Manila': 'PH', 'Asia/Jakarta': 'ID', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY',
  'Asia/Bangkok': 'TH', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Toronto': 'CA',
  'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Pacific/Auckland': 'NZ',
};
export const guessCountry = () => {
  try {
    const zone = ZONE_COUNTRIES[Intl.DateTimeFormat().resolvedOptions().timeZone];
    if (zone) return zone;
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (byIso.has(region)) return region;
  } catch { /* old browsers: fall through */ }
  return 'US';
};

// Splits a saved number into its country and local part, for showing it in the field. Numbers
// saved before the country picker (no "+") are read as local numbers in `fallback`.
export const splitPhone = (value, fallback) => {
  const v = (value || '').trim().replace(/^00/, '+');
  if (!v.startsWith('+')) return { country: fallback, national: v };
  const parsed = parsePhoneNumberFromString(v);
  if (!parsed) {
    // too short to read yet: find the country by its dial code, keeping the fallback on a tie (+1)
    const digits = v.replace(/\D/g, '');
    const match = COUNTRIES.filter((c) => digits.startsWith(c.code)).sort((a, b) => b.code.length - a.code.length);
    const country = match.find((c) => c.iso === fallback && c.code === match[0]?.code) || match[0];
    return country ? { country: country.iso, national: digits.slice(country.code.length) } : { country: fallback, national: v };
  }
  // +1 and +44 are shared; a number that doesn't name its country keeps the one picked
  const country = parsed.country || (dialCode(fallback) === parsed.countryCallingCode ? fallback
    : COUNTRIES.find((c) => c.code === parsed.countryCallingCode)?.iso || fallback);
  return { country, national: parsed.formatNational() };
};

// The international number for a country and what was typed. A pasted "+44 ..." wins over the
// picked country. Empty when nothing was typed.
export const joinPhone = (country, national) => {
  const v = (national || '').trim().replace(/^00/, '+');
  if (!v.replace(/\D/g, '')) return '';
  const parsed = parsePhoneNumberFromString(v, country);
  if (parsed) return parsed.number;
  return v.startsWith('+') ? `+${v.replace(/\D/g, '')}` : `+${dialCode(country)}${v.replace(/\D/g, '').replace(/^0+/, '')}`;
};

// a real mobile number somewhere in the world
export const isValidPhone = (value) => !!parsePhoneNumberFromString((value || '').trim())?.isValid();

// what's wrong with a number, in a sentence; '' when it's fine or empty
export const phoneProblem = (value, country) => {
  if (!value || isValidPhone(value)) return '';
  const parsed = parsePhoneNumberFromString(value);
  const where = parsed?.country || country;
  return where ? `That isn’t a valid mobile number for ${countryName(where)}.` : 'That isn’t a valid mobile number.';
};

// a real-looking local number for the field's placeholder ("050 123 4567")
export const examplePhone = (country) => {
  try { return getExampleNumber(country, examples)?.formatNational() || ''; } catch { return ''; }
};
