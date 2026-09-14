export type Values = Record<string, string>;

export type Field = {
  key: string;
  gu: string;
  en: string;
  required?: boolean;
  type?: 'text' | 'number' | 'time' | 'select';
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
    ],
  },
  {
    id: 'community',
    fields: [
      choice('community', 'પેટા સમાજ', 'Sub-community', [
        ['surti', 'સુરતી', 'Surti'],
        ['khambhati', 'ખંભાતી', 'Khambhati'],
        ['ahmedabadi', 'અમદાવાદી', 'Ahmedabadi'],
        ['indori', 'ઇન્દોરી', 'Indori'],
      ], true),
      choice('sect', 'ભક્ત / જગત', 'Sect', [['bhagat', 'ભક્ત', 'Bhagat'], ['jagat', 'જગત', 'Jagat']], true),
      { key: 'surname', gu: 'પિતૃપક્ષની અટક', en: 'Paternal surname', required: true, wide: true },
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
      { key: 'mother', gu: 'માતાનું પૂરું નામ', en: 'Mother’s full name', wide: true },
      { key: 'native', gu: 'મૂળ વતન', en: 'Native place', wide: true },
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
    ],
  },
];

export const allFields = steps.flatMap((s) => s.fields);
export const fieldByKey = new Map(allFields.map((f) => [f.key, f]));

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

/** Validate a single field in isolation. Returns true when the value is unusable. */
export function fieldInvalid(f: Field, data: Values): boolean {
  const v = (data[f.key] || '').trim();
  if (f.required && !v) return true;
  if (!v) return false;
  if (f.type === 'number') {
    const n = Number(v);
    if (!Number.isInteger(n) || n < (f.min ?? 0) || n > (f.max ?? 999)) return true;
  }
  if (f.options && !f.options.some((o) => o[0] === v)) return true;
  if (f.key === 'phone' || f.key === 'extraPhone') return !PHONE.test(v);
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
  const required = allFields.filter((f) => f.required);
  return Math.round((required.filter((f) => data[f.key]?.trim()).length / required.length) * 100);
}

export function displayValue(f: Field, value: string, english: boolean) {
  return f.options?.find((o) => o[0] === value)?.[english ? 2 : 1] || value;
}
