/**
 * Readers' usernames: "jay" makes the app "Jay's Receipts". Shown to the reader themselves (and,
 * later, on things they choose to share). Framework-free.
 */
export const NAME_MAX = 20;

/** Tidies what was typed: letters, numbers, spaces, hyphens, apostrophes and dots; at most 20 characters. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} .'’-]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.'’-]+|[\s'’-]+$/g, '')
    .slice(0, NAME_MAX)
    .trim();
}

/** How a name shows: as typed, except an all-lower-case name gets a capital ("jay" -> "Jay"). */
export const displayName = (name: string) => (name && name === name.toLowerCase() ? name[0].toUpperCase() + name.slice(1) : name);

/** "Jay" -> "Jay’s"; "James" -> "James’s" (British style). */
export const possessive = (name: string) => `${displayName(name)}’s`;

/** The app's name for this reader: "Jay’s Receipts", or "Daily Receipts" without a name. */
export const brandFor = (name: string) => (name ? `${possessive(name)} Receipts` : 'Daily Receipts');

/** The roundup's name: "Jay’s roundup", or "Your roundup". */
export const roundupFor = (name: string) => (name ? `${possessive(name)} roundup` : 'Your roundup');
