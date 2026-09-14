/**
 * FormData entries are `string | File`. Coercing one with `String()` turns an
 * unexpected file upload into the literal text "[object File]", which then
 * sails past validation as a perfectly good name. Read fields through these
 * instead, and a non-string entry becomes an empty one.
 */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** For anything user-visible. Not for passwords, where spaces are significant. */
export function trimmedField(formData: FormData, name: string): string {
  return field(formData, name).trim();
}

export function digitsField(formData: FormData, name: string): string {
  return field(formData, name).replace(/\D/g, '');
}

/**
 * Narrows a form value to a known set. A `<select>` is a suggestion, not a
 * constraint — the POST can carry anything.
 */
export function enumField<T extends string>(
  formData: FormData,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = trimmedField(formData, name);
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
