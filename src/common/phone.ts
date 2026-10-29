// Digits only. Returns undefined when there are too few digits to be a real number
export function phoneDigits(value?: string): string | undefined {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 6 ? digits : undefined;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}