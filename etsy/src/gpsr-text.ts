export interface ManufacturerContact {
  name: string; email: string; addressLine1: string; postalCode: string; city: string; country: string; gpsrRole: string; provider: string;
}
export function manufacturerDescription(description: string, contact: ManufacturerContact): string {
  if (contact.gpsrRole !== 'manufacturer' || contact.provider !== 'gelato') throw new Error('GPSR-Herstellerrolle für Gelato nicht bestätigt.');
  const keys = ['name', 'email', 'addressLine1', 'postalCode', 'city', 'country'] as const;
  for (const key of keys) if (typeof contact[key] !== 'string' || !contact[key].trim() || /[\r\n]/.test(contact[key])) throw new Error(`Ungültiger Herstellerkontakt: ${key}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new Error('Ungültige Hersteller-E-Mail.');
  const marker = 'GPSR — Manufacturer contact';
  const block = `${marker}\n${contact.name}\n${contact.addressLine1}\n${contact.postalCode} ${contact.city}\n${contact.country}\nEmail: ${contact.email}`;
  if (description.includes(marker)) {
    if (description.includes(block)) return description;
    throw new Error('Abweichender GPSR-Block vorhanden; manuell prüfen, um fremde Angaben zu erhalten.');
  }
  return `${description.trimEnd()}\n\n${block}`;
}

export function isPhysicalListing(listing: { type?: string; listing_type?: string }): boolean {
  const types = [listing.type, listing.listing_type].filter((value): value is string => value !== undefined);
  return types.length > 0 && types.every(value => value === 'physical');
}
