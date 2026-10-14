// Phone numbers in E.164 without spaces, e.g. "+447700900123".
// Numbers typed as local UK numbers ("07700 900123") are assumed to be +44.
export function toE164(raw: string, defaultCountryCode = '44'): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = defaultCountryCode + digits.slice(1);
  } else if (!digits.startsWith(defaultCountryCode)) {
    digits = defaultCountryCode + digits;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return '+' + digits;
}

export function prettyPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.startsWith('44') && d.length === 12) {
    return `+44 ${d.slice(2, 6)} ${d.slice(6)}`;
  }
  return e164;
}
