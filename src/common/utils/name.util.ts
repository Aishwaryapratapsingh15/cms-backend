import { Transform } from 'class-transformer';

// Trims and collapses inner whitespace so "Cloud  Computing " and
// "Cloud Computing" are the same name before any uniqueness check.
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export const NormalizeName = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeName(value) : value,
  );
