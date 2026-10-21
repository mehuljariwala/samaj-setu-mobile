import { formatDate } from '@/lib/age';

export type Values = Record<string, string>;

export type Field = {
  key: string;
  gu: string;
  en: string;
  required?: boolean;
  /**
   * Whom `required` binds, as public.biodata_fields.required_for: a Khatri
   * samaj biodata, a Sanatan one (a son or daughter from another Hindu caste),
   * or both when absent.
   */
  requiredFor?: 'samaj' | 'sanatan';
  /**
   * Asked only while another answer has this value, as
   * public.biodata_fields.asked_when; `required` binds only then.
   */
  askedWhen?: { key: string; value: string };
  type?: 'text' | 'number' | 'time' | 'select' | 'date';
  options?: [string, string, string][];
  min?: number;
  max?: number;
  /** Rendered under the input as helper text. */
  hint?: [string, string];
  /** Span both columns in the two-up grid. */
  wide?: boolean;
};

/**
 * A step is a validation unit. Steps are grouped into the visible accordion
 * sections by `groups` in guided-form.tsx — the two are deliberately separate
 * so sections can be re-arranged without touching validation.
 */
export type Step = { id: string; fields: Field[] };

const choice = (
  key: string,
  gu: string,
  en: string,
  options: [string, string, string][],
  required = false,
): Field => ({ key, gu, en, options, required, type: 'select' });

const RASHI: [string, string, string][] = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
].map((en, i) => [
  en,
  ['મેષ', 'વૃષભ', 'મિથુન', 'કર્ક', 'સિંહ', 'કન્યા', 'તુલા', 'વૃશ્ચિક', 'ધનુ', 'મકર', 'કુંભ', 'મીન'][i],
  en,
] as [string, string, string]);

export const steps: Step[] = [
  {
    id: 'personal',
    fields: [
      choice('gender', 'લિંગ', 'Gender', [['male', 'પુરુષ', 'Male'], ['female', 'સ્ત્રી', 'Female']], true),
      { key: 'height', gu: 'ઊંચાઈ (સે.મી.)', en: 'Height (cm)', type: 'number', min: 100, max: 250, required: true },
      choice('marital', 'વૈવાહિક સ્થિતિ', 'Marital status', [
        ['never', 'અપરિણીત', 'Never married'],
        ['divorced', 'છૂટાછેડા થયેલ', 'Divorced'],
        ['widowed', 'વિધુર / વિધવા', 'Widowed'],
      ], true),
      {
        key: 'divorceDate', gu: 'છૂટાછેડાની તારીખ', en: 'Date of divorce', type: 'date', required: true,
        askedWhen: { key: 'marital', value: 'divorced' },
      },
      {
        key: 'divorceDetails', gu: 'છૂટાછેડાની વિગત', en: 'Divorce details', required: true, wide: true,
        askedWhen: { key: 'marital', value: 'divorced' },
        hint: ['ટૂંકમાં લખો', 'In a few words'],
      },
      {
        key: 'widowedDate', gu: 'જીવનસાથીના અવસાનની તારીખ', en: 'Date of spouse’s death', type: 'date', required: true,
        askedWhen: { key: 'marital', value: 'widowed' },
      },
    ],
  },
  {
    id: 'community',
    fields: [
      { ...choice('community', 'પેટા સમાજ', 'Sub-community', [
        ['surti', 'સુરતી', 'Surti'],
        ['khambhati', 'ખંભાતી', 'Khambhati'],
        ['ahmedabadi', 'અમદાવાદી', 'Ahmedabadi'],
        ['indori', 'ઇન્દોરી', 'Indori'],
      ], true), requiredFor: 'samaj' },
      choice('sect', 'ભક્ત / જગત', 'Sect', [['bhagat', 'ભક્ત', 'Bhagat'], ['jagat', 'જગત', 'Jagat']], true),
      { key: 'surname', gu: 'પિતૃપક્ષની અટક', en: 'Paternal surname', required: true, requiredFor: 'samaj', wide: true },
      { key: 'shakh', gu: 'શાખ', en: 'Shakh', wide: true },
      { key: 'caste', gu: 'કઈ જ્ઞાતિ', en: 'Caste', required: true, requiredFor: 'sanatan', wide: true },
    ],
  },
  {
    id: 'mosal',
    fields: [
      {
        key: 'mosal',
        gu: 'મોસાળનું કુટુંબ / અટક',
        en: 'Maternal grandfather’s family / surname',
        required: true,
        requiredFor: 'samaj',
        wide: true,
        hint: ['ચોક્કસ ન હોય તો પરિવાર સાથે પુષ્ટિ કરો.', 'If unsure, confirm with your family.'],
      },
    ],
  },
  {
    id: 'education',
    fields: [
      choice('education', 'લાયકાત', 'Qualification', [
        ['school', 'શાળા', 'School'],
        ['diploma', 'ડિપ્લોમા', 'Diploma'],
        ['bachelor', 'સ્નાતક', 'Bachelor’s'],
        ['master', 'અનુસ્નાતક', 'Master’s'],
        ['doctorate', 'ડૉક્ટરેટ', 'Doctorate'],
        ['other', 'અન્ય', 'Other'],
      ], true),
      {
        key: 'degree',
        gu: 'ડિગ્રી / વિષય',
        en: 'Degree / specialisation',
        hint: ['જેમ કે B.Com, કમ્પ્યુટર એન્જિનિયરિંગ', 'For example B.Com, Computer Engineering'],
      },
    ],
  },
  {
    id: 'work',
    fields: [
      choice('work', 'હાલની સ્થિતિ', 'Current status', [
        ['employed', 'નોકરી', 'Employed'],
        ['business', 'વ્યવસાય', 'Business'],
        ['student', 'વિદ્યાર્થી', 'Student'],
        ['not_working', 'હાલ કામ નથી', 'Not working'],
        ['other', 'અન્ય', 'Other'],
      ], true),
      { key: 'role', gu: 'વ્યવસાય / ભૂમિકા', en: 'Profession / role' },
      { key: 'employer', gu: 'કંપની / વ્યવસાયનું નામ', en: 'Employer / business name', wide: true },
    ],
  },
  {
    id: 'family',
    fields: [
      { key: 'mother', gu: 'માતાનું પૂરું નામ', en: 'Mother’s full name', required: true, requiredFor: 'sanatan', wide: true },
      { key: 'native', gu: 'મૂળ વતન', en: 'Native place', wide: true },
      { key: 'fatherWork', gu: 'પિતાનો વ્યવસાય', en: 'Father’s occupation', required: true, requiredFor: 'sanatan', wide: true },
      { key: 'hometown', gu: 'ગામ / શહેર', en: 'Village or town', required: true, requiredFor: 'sanatan' },
      { key: 'state', gu: 'રાજ્ય', en: 'State', required: true, requiredFor: 'sanatan' },
    ],
  },
  {
    id: 'lifestyle',
    fields: [
      choice('diet', 'આહાર', 'Diet', [
        ['vegetarian', 'શાકાહારી', 'Vegetarian'],
        ['jain', 'જૈન', 'Jain'],
        ['eggetarian', 'ઇંડા સહિત', 'Eggetarian'],
        ['nonveg', 'માંસાહારી', 'Non-vegetarian'],
        ['other', 'અન્ય', 'Other'],
      ]),
      { key: 'brothers', gu: 'ભાઈઓની સંખ્યા', en: 'Number of brothers', type: 'number', min: 0, max: 30 },
      { key: 'sisters', gu: 'બહેનોની સંખ્યા', en: 'Number of sisters', type: 'number', min: 0, max: 30 },
    ],
  },
  {
    id: 'birth',
    fields: [
      { key: 'birthplace', gu: 'જન્મ સ્થળ', en: 'Birthplace' },
      { key: 'birthtime', gu: 'જન્મ સમય', en: 'Birth time', type: 'time' },
    ],
  },
  {
    id: 'astro',
    fields: [
      choice('rashi', 'રાશિ', 'Rashi', [['unknown', 'જાણ નથી', 'Not known'], ...RASHI]),
      choice('gan', 'ગણ', 'Gan', [
        ['unknown', 'જાણ નથી', 'Not known'],
        ['dev', 'દેવ', 'Dev'],
        ['manushya', 'મનુષ્ય', 'Manushya'],
        ['rakshas', 'રાક્ષસ', 'Rakshas'],
      ]),
      choice('mangal', 'મંગળ સ્થિતિ', 'Mangal status', [
        ['unknown', 'જાણ નથી', 'Not known'],
        ['yes', 'મંગળ છે', 'Manglik'],
        ['no', 'મંગળ નથી', 'Not Manglik'],
      ]),
    ],
  },
  {
    id: 'contact',
    fields: [
      choice('contactKind', 'સંપર્ક વ્યક્તિ', 'Contact person', [
        ['self', 'ઉમેદવાર', 'Candidate'],
        ['father', 'પિતા', 'Father'],
        ['mother', 'માતા', 'Mother'],
        ['guardian', 'વાલી', 'Guardian'],
      ], true),
      { key: 'phone', gu: 'સંપર્ક નંબર', en: 'Contact number', required: true },
      { key: 'extraPhone', gu: 'વધારાનો નંબર', en: 'Additional number' },
      { key: 'fatherPhone', gu: 'પિતાનો મોબાઇલ નંબર', en: 'Father’s mobile number', required: true, requiredFor: 'sanatan' },
      {
        key: 'address', gu: 'હાલનું સરનામું', en: 'Current address', required: true, wide: true,
        hint: ['જ્યાં હાલ રહો છો · ફક્ત એડમિન જુએ છે', 'Where you live now · only an admin sees it'],
      },
      {
        key: 'nativeAddress', gu: 'મૂળ વતનનું સરનામું', en: 'Native address', wide: true,
        hint: ['ફક્ત એડમિન જુએ છે', 'Only an admin sees it'],
      },
    ],
  },
  {
    // Not a question: stamped by the server from the registration's
    // Sanatan box, and carried so validation here matches validation there.
    id: 'meta',
    fields: [
      choice('origin', 'પ્રોફાઇલ પ્રકાર', 'Profile type', [
        ['samaj', 'ખત્રી સમાજ', 'Khatri samaj'],
        ['sanatan', 'સનાતન (અન્ય હિન્દુ જ્ઞાતિ)', 'Sanatan (another Hindu caste)'],
      ]),
    ],
  },
];

export const allFields = steps.flatMap((s) => s.fields);
export const fieldByKey = new Map(allFields.map((f) => [f.key, f]));

/** A Sanatan son's or daughter's biodata (origin stamped by the server). */
export const isSanatan = (data: Values) => data.origin === 'sanatan';

/** What a Sanatan profile is called, [gu, en]: a son or a daughter from another Hindu caste. */
export function sanatanLabel(gender: string | null | undefined): [string, string] {
  return gender === 'male' ? ['સનાતન દીકરો', 'Sanatan son'] : ['સનાતન દીકરી', 'Sanatan daughter'];
}

/** Fields only a Khatri samaj biodata asks, and only a Sanatan one. */
export const SAMAJ_ONLY = ['community', 'mosal', 'shakh'];
export const SANATAN_ONLY = ['caste', 'fatherWork', 'hometown', 'state', 'fatherPhone'];

/** The questions a biodata of this kind asks — what an admin may flag in it. */
export function fieldsFor(sanatan: boolean): Field[] {
  const skip = sanatan ? SAMAJ_ONLY : SANATAN_ONLY;
  return allFields.filter((f) => f.key !== 'origin' && !skip.includes(f.key));
}

/** Whether this biodata is asked the field at all, by its `askedWhen`. */
export function isAsked(f: Field, data: Values): boolean {
  return !f.askedWhen || data[f.askedWhen.key] === f.askedWhen.value;
}

/** Whether a field must be filled for this biodata, by whom `required` binds. */
export function isRequired(f: Field, data: Values): boolean {
  if (!f.required || !isAsked(f, data)) return false;
  if (!f.requiredFor) return true;
  return f.requiredFor === (isSanatan(data) ? 'sanatan' : 'samaj');
}

/**
 * Keys the form holds for its own purposes that `public.biodata_fields` does
 * not know about. `save_biodata_draft` rejects an unknown key rather than
 * ignoring it, so these are stripped before every write.
 *
 * `birthUnknown` is the only one left: photographs and janmakshar are real
 * uploads now (see components/app/media-uploader.tsx) rather than flags in the
 * biodata payload.
 */
export const NON_FIELD_KEYS = ['birthUnknown'];

/** The subset of a form's values that may be sent to the server. */
export function persistable(data: Values): Values {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => fieldByKey.has(key)),
  );
}

const PHONE = /^[6-9]\d{9}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real day, from 1940 on and not in the future, as the server checks it. */
function isPastDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === v
    && v >= '1940-01-01'
    && date.getTime() <= Date.now();
}

/** Validate a single field in isolation. Returns true when the value is unusable. */
export function fieldInvalid(f: Field, data: Values): boolean {
  const v = (data[f.key] || '').trim();
  if (isRequired(f, data) && !v) return true;
  if (!v) return false;
  if (f.type === 'number') {
    const n = Number(v);
    if (!Number.isInteger(n) || n < (f.min ?? 0) || n > (f.max ?? 999)) return true;
  }
  if (f.options && !f.options.some((o) => o[0] === v)) return true;
  if (f.type === 'date') return !isPastDate(v);
  if (f.key === 'phone' || f.key === 'extraPhone' || f.key === 'fatherPhone') return !PHONE.test(v);
  return false;
}

export function validate(step: Step, data: Values): string[] {
  return [...new Set(step.fields.filter((f) => fieldInvalid(f, data)).map((f) => f.key))];
}

/** Validate an explicit set of field keys — used for a section's own status badge. */
export function validateKeys(keys: string[], data: Values): string[] {
  return [...new Set(keys.filter((k) => {
    const f = fieldByKey.get(k);
    return f ? fieldInvalid(f, data) : false;
  }))];
}

export function completion(data: Values) {
  const required = allFields.filter((f) => isRequired(f, data));
  return Math.round((required.filter((f) => data[f.key]?.trim()).length / required.length) * 100);
}

export function displayValue(f: Field, value: string, english: boolean) {
  if (f.type === 'date') return formatDate(value, english ? 'en' : 'gu');
  return f.options?.find((o) => o[0] === value)?.[english ? 2 : 1] || value;
}
