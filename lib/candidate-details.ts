/**
 * Shared by the two places a family enters the candidate's registration
 * details: the registration itself, and the biodata screen once approved.
 */

export const CITIES = ['Surat', 'Ahmedabad', 'Vadodara', 'Rajkot', 'Mumbai'];

/**
 * Computed once at module load rather than per render: calling Date.now()
 * during render makes the output depend on when React happens to re-run, which
 * the React compiler flags as impure. A day's drift in the maximum selectable
 * birth date is not worth an unstable render.
 */
export const LATEST_BIRTH_DATE = new Date(Date.now() - 18 * 365.25 * 86_400_000)
  .toISOString()
  .slice(0, 10);
