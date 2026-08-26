import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Normalize local Chinese numbers and explicit international numbers to E.164. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value, "CN");
  return parsed?.isValid() ? parsed.number : null;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 7) return `${phone.slice(0, 2)}***${phone.slice(-2)}`;
  return `${phone.slice(0, 4)}****${phone.slice(-4)}`;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}
