/**
 * `fetch` for the Supabase clients, with one retry for a fresh session.
 *
 * Supabase's auth server and its database API keep separate clocks. Straight
 * after sign-up or sign-in, the new token can reach the API a moment "before"
 * it was issued by the API's reckoning, and is refused with `JWT issued at
 * future`. A second later the same token is fine — so wait a second and ask
 * once more, instead of showing a member who just signed in an error screen.
 *
 * Bodies here are strings, Blobs or Files, all of which can be sent twice.
 */
export const supabaseFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status !== 401 && response.status !== 403) return response;

  const text = await response.clone().text().catch(() => '');
  if (!/issued at future/i.test(text)) return response;

  await new Promise((resolve) => setTimeout(resolve, 1200));
  return fetch(input, init);
};
