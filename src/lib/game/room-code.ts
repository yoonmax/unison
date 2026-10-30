/** Room code alphabet: no 0/O, 1/I/L — easy to read aloud and type. */
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 5;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Uppercase, strip separators people commonly paste ("k7p-2q"), then validate. */
export function parseRoomCode(raw: string): string | null {
  const code = raw.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

/**
 * Generate a code with a cryptographically secure source. `randomInt` is
 * injected so this module stays isomorphic; the server passes node:crypto.
 */
export function generateRoomCode(randomInt: (maxExclusive: number) => number): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
