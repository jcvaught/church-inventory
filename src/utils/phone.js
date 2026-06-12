// US phone-number formatting. Formats a 10-digit US number as (123) 456-7890.
// Used for the People Access "Add Person" form (as-you-type) and anywhere a
// stored phone is displayed, so digit-only input renders consistently.
//
// Safe for progressive (as-you-type) use: it strips to digits and reformats on
// every keystroke, so partial numbers format incrementally and backspace works.
// Anything longer than 10 digits is treated as an extension (… x123).
export function formatPhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  // Drop a leading US country code when it makes the number 11 digits.
  const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)} x${d.slice(10)}`;
}
