/**
 * Where a request came from, for the activity log. Kept apart from activity.ts
 * because proxy.ts needs it too, and that file is server-only.
 */
export function originOf(source: Headers) {
  return {
    ip: source.get('x-forwarded-for')?.split(',')[0]?.trim() || source.get('x-real-ip') || null,
    userAgent: source.get('user-agent'),
  };
}
