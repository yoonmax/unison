// The last nickname used on this device, to prefill forms. Local only.
const KEY = "unison:nickname";

export function rememberedNickname(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberNickname(name: string) {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // storage unavailable
  }
}
