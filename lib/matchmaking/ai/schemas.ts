import { z } from 'zod';

// Zod schema for validating AI output — per spec §49, §85
// AI MUST NOT invent scores — only textual interpretation fields allowed
export const AIReportSchema = z.object({
  reportVersion: z.string().default('1.0.0'),
  summary: z.string().min(10).max(1000),
  overallInterpretation: z.string().min(10).max(2000),
  gunaMilan: z.object({
    summary: z.string().min(5).max(500),
    interpretation: z.string().min(10).max(1000),
  }),
  rashiAnalysis: z.string().min(5).max(800),
  nakshatraAnalysis: z.string().min(5).max(800),
  ganaAnalysis: z.string().min(5).max(500),
  gotraAnalysis: z.string().min(5).max(500),
  manglikAnalysis: z.string().min(5).max(800),
  emotionalAnalysis: z.string().min(5).max(800),
  communicationAnalysis: z.string().min(5).max(800),
  familyAnalysis: z.string().min(5).max(800),
  lifestyleAnalysis: z.string().min(5).max(800),
  financialAnalysis: z.string().min(5).max(800),
  careerAnalysis: z.string().min(5).max(800),
  longTermAnalysis: z.string().min(5).max(800),
  favorableFactors: z.array(z.string()).max(10),
  cautionFactors: z.array(z.string()).max(10),
  practicalConsiderations: z.array(z.string()).max(10),
  finalAssessment: z.string().min(10).max(1000),
});

export type AIReportValidated = z.infer<typeof AIReportSchema>;

// Validate AI output — ensures AI only wrote text, not invented numbers
export function validateAIReport(raw: unknown): AIReportValidated {
  return AIReportSchema.parse(raw);
}
