import { z } from 'zod';

export const BirthDetailsSchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  timeOfBirth: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Must be HH:mm or HH:mm:ss'),
  placeOfBirth: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1),
  birthTimeAccuracy: z.enum(['exact', 'approximate', 'unknown']).optional(),
  gotra: z.string().optional(),
});

export type BirthDetails = z.infer<typeof BirthDetailsSchema>;

export const PersonInputSchema = z.object({
  externalUserId: z.string().optional(),
  name: z.string().optional(),
  birthDetails: BirthDetailsSchema,
});

export type PersonInput = z.infer<typeof PersonInputSchema>;

export const PersonReferenceSchema = z.object({
  userId: z.string().optional(),
  kundliId: z.string().optional(),
  birthDetails: BirthDetailsSchema.optional(),
  gotra: z.string().optional(),
}).refine(
  (data) => data.userId ?? data.kundliId ?? data.birthDetails,
  { message: 'At least one of userId, kundliId, or birthDetails must be provided.' },
);

export type PersonReference = z.infer<typeof PersonReferenceSchema>;
