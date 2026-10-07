import { describe, expect, it } from 'vitest';

import { whatChanged } from '@/lib/biodata-changes';
import { translator } from '@/lib/i18n';

const t = translator('en');
const candidate = {
  full_name: 'Nilkanth M Matliwala', date_of_birth: '1990-03-18', gender: 'female',
  father_name: 'Mahesh Matliwala', city: 'Surat',
};
const live = { gender: 'female', height: '170', community: 'surti', mosal: 'Desai', origin: 'samaj' };

describe('whatChanged', () => {
  it('lists registration details first, in words, then changed biodata fields', () => {
    const rows = whatChanged(t, 'en', {
      candidate,
      published: { data: live },
      revision: {
        data: { ...live, gender: 'male', community: 'khambhati', origin: 'samaj' },
        detail_changes: { gender: 'male', city: 'Ahmedabad' },
      },
    });
    expect(rows).toEqual([
      { label: 'Gender', before: 'Female', after: 'Male' },
      { label: 'City', before: 'Surat', after: 'Ahmedabad' },
      { label: 'Sub-community', before: 'Surti', after: 'Khambhati' },
    ]);
  });

  it('shows fields that were added or cleared, and nothing for an unchanged copy', () => {
    expect(whatChanged(t, 'en', {
      candidate,
      published: { data: live },
      revision: { data: { ...live, mosal: '', diet: 'vegetarian' }, detail_changes: {} },
    })).toEqual([
      { label: 'Maternal grandfather’s family / surname', before: 'Desai', after: '' },
      { label: 'Diet', before: '', after: 'Vegetarian' },
    ]);
    expect(whatChanged(t, 'en', { candidate, published: { data: live }, revision: { data: live, detail_changes: {} } }))
      .toEqual([]);
  });
});
