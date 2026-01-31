export function generateUUID(): string {
  const pattern = [1e7, -1e3, -4e3, -8e3, -1e11].map(String).join("");
  // UUID v4-ish template with random bits.
  const uuidPart = pattern.replace(/[018]/g, c =>
    (parseInt(c, 10) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (parseInt(c, 10) / 4)))).toString(16)
  );
  const randomPart = String(Math.floor(Math.random() * 1e13));
  return uuidPart + randomPart;
}

export function generateRandomHex(length: number): string {
  let result = "";
  const hexChars = "0123456789abcdef";
  for (let i = 0; i < length; i++) {
    result += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
  }
  return result;
}

// Random Request ID, format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export function randomRequestId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20, 32)}`;
}
