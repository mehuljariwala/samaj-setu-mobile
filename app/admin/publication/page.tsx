import { redirect } from 'next/navigation';

/**
 * Biodata reviews are part of the one admin list now (app/admin/page.tsx),
 * next to the registrations, so a family is never "approved" in one list
 * while it waits in another. This address stays for old links.
 */
export default function PublicationQueuePage() {
  redirect('/admin');
}
