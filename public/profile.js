// Shared validation for the form and the authenticated API. No storage or network access.
export const profileFields = [
  { key: 'firstName', label: 'Förnamn', autocomplete: 'given-name', max: 80 },
  { key: 'lastName', label: 'Efternamn', autocomplete: 'family-name', max: 80 },
  { key: 'phone', label: 'Telefonnummer', autocomplete: 'tel', max: 30, type: 'tel' },
  { key: 'addressLine1', label: 'Gatuadress', autocomplete: 'address-line1', max: 160 },
  { key: 'addressLine2', label: 'Lägenhet eller extra adressrad (valfritt)', autocomplete: 'address-line2', max: 160, optional: true },
  { key: 'careOf', label: 'C/O (valfritt)', autocomplete: 'off', max: 80, optional: true },
  { key: 'postalCode', label: 'Postnummer', autocomplete: 'postal-code', max: 6 },
  { key: 'city', label: 'Ort', autocomplete: 'address-level2', max: 80 },
];
export function validateEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[\u0000-\u001f\u007f]/.test(value);
}
export function normalizeProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Kontrollera leveransuppgifterna.');
  const allowed = [...profileFields.map(field => field.key), 'countryCode'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Leveransprofilen innehåller okända fält.');
  const profile = {};
  for (const field of profileFields) {
    const value = input[field.key] ?? '';
    if (typeof value !== 'string' || value.length > field.max || /[\u0000-\u001f\u007f]/.test(value) || !field.optional && !value.trim()) throw new Error(`Kontrollera fältet ${field.label.toLowerCase()}.`);
    profile[field.key] = value.trim();
  }
  profile.phone = profile.phone.replace(/[\s()-]/g, '');
  if (profile.phone.startsWith('00')) profile.phone = `+${profile.phone.slice(2)}`;
  if (/^0\d{8,9}$/.test(profile.phone)) profile.phone = `+46${profile.phone.slice(1)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(profile.phone)) throw new Error('Ange ett telefonnummer med landskod, exempelvis +46.');
  profile.postalCode = profile.postalCode.replace(/\s/g, '');
  if (!/^\d{5}$/.test(profile.postalCode)) throw new Error('Ange ett svenskt postnummer med fem siffror.');
  if (input.countryCode !== 'SE') throw new Error('Den första versionen stöder leveransadresser i Sverige.');
  profile.countryCode = 'SE';
  return profile;
}
export function autofillValues(profile, email) {
  const clean = normalizeProfile(profile);
  if (!validateEmail(email)) throw new Error('En giltig e-postadress behövs.');
  return { ...clean, email, phoneE164: clean.phone, deliveryPostalCode: clean.postalCode, fullName: `${clean.firstName} ${clean.lastName}` };
}
