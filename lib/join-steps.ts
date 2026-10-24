/**
 * Each screen's name in the address (`/register?step=documents`), so the
 * phone's own back and forward buttons move between the three screens instead
 * of leaving the page, and the biodata's Back can open the documents again.
 *
 * Kept out of join-flow.tsx: that file is 'use client', and a server page that
 * imports a plain value from it gets a client reference, not the array.
 */
export const JOIN_STEPS = ['account', 'candidate', 'documents'] as const;
