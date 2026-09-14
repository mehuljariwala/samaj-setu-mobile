import type { AICompatibilityInput } from '../types/aiReport.js';

// PROMPT_VERSION: 1.0.0
// Per spec §47 — Gemma may ONLY interpret; it may NOT invent scores or data
export const SYSTEM_PROMPT = `You are an expert Vedic astrologer providing thoughtful matrimonial compatibility interpretations.

STRICT RULES:
1. You interpret ONLY the astrological evidence provided to you.
2. You NEVER invent, assume, or fabricate planetary positions, scores, houses, or birth data.
3. You NEVER claim scientific certainty. All statements reflect traditional astrological interpretation.
4. You NEVER make absolute marriage predictions ("guaranteed", "will divorce", "100% compatible").
5. You NEVER make medical, fertility, or death predictions.
6. You NEVER make guaranteed financial predictions.
7. Use language like: "traditionally favorable", "areas of caution", "potential strengths", "worth discussing".
8. You respond ONLY with valid JSON matching the exact schema provided.
9. If data for a factor is marked insufficient_data or unknown, say "Insufficient data available for this factor."
10. All finalAssessment and summary text must be balanced, respectful, and culturally sensitive.`;

export function buildUserPrompt(input: AICompatibilityInput): string {
  const gunaInterp = input.gunaMilan.interpretation;
  const gunaScore = `${input.gunaMilan.score}/36 (${input.gunaMilan.percentage}%)`;

  return `Provide a matrimonial compatibility interpretation based on the following Vedic astrological analysis.

ASTROLOGICAL METHODOLOGY:
- System: ${input.methodology.astrologySystem}
- Ayanamsha: ${input.methodology.ayanamsha}
- Algorithm Version: ${input.methodology.algorithmVersion}

GUN MILAN (ASHTAKOOT):
- Score: ${gunaScore}
- Varna: ${input.gunaMilan.varna.score}/${input.gunaMilan.varna.maximumScore}
- Vashya: ${input.gunaMilan.vashya.score}/${input.gunaMilan.vashya.maximumScore}
- Tara: ${input.gunaMilan.tara.score}/${input.gunaMilan.tara.maximumScore}
- Yoni: ${input.gunaMilan.yoni.score}/${input.gunaMilan.yoni.maximumScore}
- Graha Maitri: ${input.gunaMilan.grahaMaitri.score}/${input.gunaMilan.grahaMaitri.maximumScore}
- Gana: ${input.gunaMilan.gana.score}/${input.gunaMilan.gana.maximumScore}
- Bhakoot: ${input.gunaMilan.bhakoot.score}/${input.gunaMilan.bhakoot.maximumScore}
- Nadi: ${input.gunaMilan.nadi.score}/${input.gunaMilan.nadi.maximumScore}
- Summary: ${gunaInterp}

RASHI (MOON SIGN): Status=${input.factors.rashi.status}, Score=${input.factors.rashi.score ?? 'N/A'}/100
Evidence: ${input.factors.rashi.evidence.join('; ')}

NAKSHATRA: Status=${input.factors.nakshatra.status}, Score=${input.factors.nakshatra.score ?? 'N/A'}/100
Evidence: ${input.factors.nakshatra.evidence.join('; ')}

GANA: Status=${input.factors.gana.status}, Score=${input.factors.gana.score ?? 'N/A'}/100
Evidence: ${input.factors.gana.evidence.join('; ')}

GOTRA: Status=${input.factors.gotra.status}
Evidence: ${input.factors.gotra.evidence.join('; ')}

MANGLIK: PersonA=${input.factors.manglik.personA.isManglik}, PersonB=${input.factors.manglik.personB.isManglik}
Compatibility: ${input.factors.manglik.compatibilityStatus}
${input.factors.manglik.explanation ?? ''}

EMOTIONAL: Score=${input.factors.emotional.score ?? 'N/A'}/100, Status=${input.factors.emotional.status}
Evidence: ${input.factors.emotional.evidence.join('; ')}

COMMUNICATION: Score=${input.factors.communication.score ?? 'N/A'}/100, Status=${input.factors.communication.status}

FAMILY: Score=${input.factors.family.score ?? 'N/A'}/100, Status=${input.factors.family.status}

LIFESTYLE: Score=${input.factors.lifestyle.score ?? 'N/A'}/100, Status=${input.factors.lifestyle.status}

FINANCIAL (astrological interpretation only — NOT financial advice):
Score=${input.factors.financial.score ?? 'N/A'}/100, Status=${input.factors.financial.status}
Evidence: ${input.factors.financial.evidence.join('; ')}

CAREER: Score=${input.factors.career.score ?? 'N/A'}/100, Status=${input.factors.career.status}

LONG-TERM: Score=${input.factors.longTerm.score ?? 'N/A'}/100, Status=${input.factors.longTerm.status}

OVERALL: Score=${input.overall.score}/100, Category=${input.overall.category}, Confidence=${input.overall.confidence}

FAVORABLE FACTORS: ${input.favorableFactors.map((f) => f.factor).join(', ') || 'None identified'}
CAUTION FACTORS: ${input.cautionFactors.map((f) => f.factor).join(', ') || 'None identified'}

LANGUAGE: ${input.language}

Respond with JSON only, matching this exact structure:
{
  "reportVersion": "1.0.0",
  "summary": "...",
  "overallInterpretation": "...",
  "gunaMilan": { "summary": "...", "interpretation": "..." },
  "rashiAnalysis": "...",
  "nakshatraAnalysis": "...",
  "ganaAnalysis": "...",
  "gotraAnalysis": "...",
  "manglikAnalysis": "...",
  "emotionalAnalysis": "...",
  "communicationAnalysis": "...",
  "familyAnalysis": "...",
  "lifestyleAnalysis": "...",
  "financialAnalysis": "...",
  "careerAnalysis": "...",
  "longTermAnalysis": "...",
  "favorableFactors": ["..."],
  "cautionFactors": ["..."],
  "practicalConsiderations": ["..."],
  "finalAssessment": "..."
}`;
}
