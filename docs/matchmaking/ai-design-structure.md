# AI Matchmaking Engine

## Complete Engineering & Implementation Specification

**Document:** `AI_MATCHMAKING_ENGINE_SPEC.md`
**Location:** `/ai/docs/AI_MATCHMAKING_ENGINE_SPEC.md`
**Version:** `1.0.0`
**Status:** Implementation Specification
**Purpose:** Independent AI-assisted Vedic Kundli matrimonial compatibility engine

---

# 1. Objective

Build a completely independent matchmaking service inside the `/ai/` project directory.

The service must:

1. Accept structured birth/profile information.
2. Obtain authoritative Vedic astrology/Kundli calculations from Navamsha.
3. Normalize and persist the Kundli data.
4. Calculate deterministic compatibility factors.
5. Calculate a comprehensive matrimonial compatibility score.
6. Send only the required structured compatibility information to an LLM.
7. Use OpenRouter + Gemma as the AI interpretation layer.
8. Produce a structured compatibility report.
9. Expose clean HTTP APIs.
10. Be completely independent from the existing website frontend/backend.
11. Be designed so the existing application eventually needs to know only:

* input endpoint
* request schema
* response schema

12. Never require a conversational chatbot interface.

The final system must be usable as a standalone service.

---

# 2. Core Architecture

The system must follow this architecture:

```text
                     EXTERNAL WEBSITE
                            |
                            | HTTP API
                            v
                +-------------------------+
                |    AI MATCHMAKING API   |
                |         /ai/            |
                +------------+------------+
                             |
                +------------v------------+
                |    Input Validation    |
                +------------+------------+
                             |
                +------------v------------+
                |   Astrology Provider   |
                |       Navamsha          |
                +------------+------------+
                             |
                +------------v------------+
                |  Kundli Normalization  |
                +------------+------------+
                             |
                +------------v------------+
                |   Compatibility Engine |
                |   Deterministic Rules   |
                +------------+------------+
                             |
                +------------v------------+
                | Compatibility JSON     |
                +------------+------------+
                             |
                +------------v------------+
                |    AI Report Engine     |
                | OpenRouter + Gemma      |
                +------------+------------+
                             |
                +------------v------------+
                | Output Validation       |
                +------------+------------+
                             |
                +------------v------------+
                | Final Match Report      |
                +-------------------------+
```

---

# 3. Critical Design Principle

## The LLM is NOT the astrology calculator.

The LLM must never be responsible for:

* calculating planetary positions
* calculating Lagna
* calculating Rashi
* calculating Nakshatra
* calculating Guna scores
* calculating Manglik
* calculating Nadi
* calculating Bhakoot
* calculating Yoni
* calculating Graha Maitri
* calculating Varna
* calculating Vashya
* calculating Gana
* inventing compatibility scores
* changing deterministic scores

The authoritative calculation sources are:

```text
Navamsha
+
our deterministic matchmaking rules
```

Gemma is responsible only for:

```text
interpretation
explanation
summarization
report generation
```

---

# 4. Technology Requirements

Preferred implementation:

```text
Runtime: Node.js
Language: TypeScript
API: Fastify or Express
Database: PostgreSQL
Validation: Zod
HTTP client: native fetch / axios
Testing: Vitest
Linting: ESLint
Formatting: Prettier
Environment: dotenv
AI: OpenRouter
AI model: google/gemma-4-31b-it:free
Astrology API: Navamsha
```

If the existing `/ai/` project already has a framework, preserve the existing framework where practical.

Do not rewrite unrelated existing code.

---

# 5. Environment Variables

Create:

```text
.env
```

Never hardcode API keys.

Required variables:

```env
NODE_ENV=development

PORT=8000

DATABASE_URL=

NAVAMSHA_API_KEY=
NAVAMSHA_BASE_URL=https://api.navamsha.in

OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=google/gemma-4-31b-it:free

APP_NAME=AI-Matchmaking
APP_VERSION=1.0.0

ALGORITHM_VERSION=1.0.0
PROMPT_VERSION=1.0.0
```

Optional:

```env
LOG_LEVEL=info
REQUEST_TIMEOUT_MS=30000
NAVAMSHA_TIMEOUT_MS=15000
OPENROUTER_TIMEOUT_MS=30000

AI_MAX_RETRIES=2
ASTROLOGY_MAX_RETRIES=2

ENABLE_AI_REPORT=true
ENABLE_DATABASE=true
```

---

# 6. Security Requirements

Never expose:

```text
NAVAMSHA_API_KEY
OPENROUTER_API_KEY
DATABASE_URL
```

to the frontend.

The browser must never directly call Navamsha or OpenRouter.

Correct:

```text
Browser
  |
  v
Our backend
  |
  +--> Navamsha
  |
  +--> OpenRouter
```

Incorrect:

```text
Browser
  |
  +--> Navamsha
  |
  +--> OpenRouter
```

Implement:

* input validation
* request size limits
* rate limiting
* authentication hooks where applicable
* API key protection
* timeout handling
* retry handling
* error sanitization
* structured logging
* no secret values in logs

---

# 7. Folder Structure

Create the following structure:

```text
ai/
│
├── docs/
│   ├── AI_MATCHMAKING_ENGINE_SPEC.md
│   ├── API.md
│   ├── ASTROLOGY_DATA_DICTIONARY.md
│   ├── MATCHING_METHODOLOGY.md
│   └── TESTING.md
│
├── src/
│   │
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── health.routes.ts
│   │   │   ├── kundli.routes.ts
│   │   │   └── match.routes.ts
│   │   │
│   │   ├── controllers/
│   │   │   ├── kundli.controller.ts
│   │   │   └── match.controller.ts
│   │   │
│   │   └── middleware/
│   │       ├── auth.ts
│   │       ├── rateLimit.ts
│   │       └── errorHandler.ts
│   │
│   ├── config/
│   │   └── env.ts
│   │
│   ├── types/
│   │   ├── birth.ts
│   │   ├── kundli.ts
│   │   ├── astrology.ts
│   │   ├── compatibility.ts
│   │   ├── aiReport.ts
│   │   └── api.ts
│   │
│   ├── astrology/
│   │   ├── AstrologyProvider.ts
│   │   ├── NavamshaProvider.ts
│   │   ├── navamshaClient.ts
│   │   ├── kundliNormalizer.ts
│   │   ├── kundliCache.ts
│   │   └── astrologyValidator.ts
│   │
│   ├── matching/
│   │   ├── MatchEngine.ts
│   │   ├── MatchContext.ts
│   │   │
│   │   ├── gunMilan/
│   │   │   ├── gunMilan.ts
│   │   │   ├── varna.ts
│   │   │   ├── vashya.ts
│   │   │   ├── tara.ts
│   │   │   ├── yoni.ts
│   │   │   ├── grahaMaitri.ts
│   │   │   ├── gana.ts
│   │   │   ├── bhakoot.ts
│   │   │   └── nadi.ts
│   │   │
│   │   ├── rashi.ts
│   │   ├── nakshatra.ts
│   │   ├── gotra.ts
│   │   ├── manglik.ts
│   │   ├── emotional.ts
│   │   ├── communication.ts
│   │   ├── family.ts
│   │   ├── lifestyle.ts
│   │   ├── financial.ts
│   │   ├── career.ts
│   │   ├── longTerm.ts
│   │   │
│   │   ├── scoring/
│   │   │   ├── scoreCalculator.ts
│   │   │   ├── weights.ts
│   │   │   └── scoreNormalizer.ts
│   │   │
│   │   └── rules/
│   │       ├── compatibilityRules.ts
│   │       └── ruleVersion.ts
│   │
│   ├── ai/
│   │   ├── AIProvider.ts
│   │   ├── OpenRouterProvider.ts
│   │   ├── gemma.ts
│   │   ├── prompts.ts
│   │   ├── schemas.ts
│   │   ├── aiInputBuilder.ts
│   │   └── aiOutputValidator.ts
│   │
│   ├── pipeline/
│   │   ├── kundliPipeline.ts
│   │   └── matchmakingPipeline.ts
│   │
│   ├── database/
│   │   ├── client.ts
│   │   ├── repositories/
│   │   │   ├── kundliRepository.ts
│   │   │   ├── matchRepository.ts
│   │   │   └── reportRepository.ts
│   │   └── migrations/
│   │
│   ├── utils/
│   │   ├── hashing.ts
│   │   ├── dates.ts
│   │   ├── numbers.ts
│   │   └── logger.ts
│   │
│   └── constants/
│       ├── rashis.ts
│       ├── nakshatras.ts
│       ├── planets.ts
│       └── astrology.ts
│
├── tests/
│   │
│   ├── fixtures/
│   │   ├── personA.json
│   │   ├── personB.json
│   │   ├── kundliA.json
│   │   └── kundliB.json
│   │
│   ├── unit/
│   │   ├── gunMilan.test.ts
│   │   ├── rashi.test.ts
│   │   ├── nakshatra.test.ts
│   │   ├── gotra.test.ts
│   │   ├── manglik.test.ts
│   │   ├── emotional.test.ts
│   │   ├── communication.test.ts
│   │   ├── family.test.ts
│   │   ├── financial.test.ts
│   │   ├── lifestyle.test.ts
│   │   └── longTerm.test.ts
│   │
│   ├── integration/
│   │   ├── navamsha.test.ts
│   │   ├── matchmaking.test.ts
│   │   └── ai.test.ts
│   │
│   └── e2e/
│       └── api.test.ts
│
├── package.json
├── tsconfig.json
├── .env
├── .env.example
└── README.md
```

---

# 8. Data Flow

## 8.1 Profile Creation

Input:

```text
Birth details
+
Gotra
```

Flow:

```text
POST /kundli
      |
      v
Validate input
      |
      v
Generate birth-data hash
      |
      v
Check database/cache
      |
      +---- exists ----> return existing Kundli
      |
      v
Navamsha API
      |
      v
Validate response
      |
      v
Normalize response
      |
      v
Store normalized Kundli
      |
      v
Return Kundli
```

---

# 9. Birth Details Schema

```typescript
interface BirthDetails {
  dateOfBirth: string;       // YYYY-MM-DD
  timeOfBirth: string;       // HH:mm:ss
  placeOfBirth: string;

  latitude: number;
  longitude: number;

  timezone: string;

  birthTimeAccuracy?: 
    | "exact"
    | "approximate"
    | "unknown";

  gotra?: string;
}
```

Validation:

```text
dateOfBirth:
  valid ISO date

timeOfBirth:
  valid 24-hour time

latitude:
  -90 <= value <= 90

longitude:
  -180 <= value <= 180

timezone:
  valid IANA timezone

gotra:
  optional string
```

Do not infer Gotra from birth details.

---

# 10. Person Schema

```typescript
interface PersonInput {
  externalUserId?: string;
  name?: string;

  birthDetails: BirthDetails;
}
```

The AI layer should not need:

```text
name
email
phone
address
```

unless explicitly required.

---

# 11. Normalized Kundli Schema

Create an internal canonical schema independent of Navamsha.

```typescript
interface Kundli {
  id: string;

  provider: "navamsha";
  providerVersion?: string;

  methodology: {
    system: "vedic";
    ayanamsha: "lahiri";
    houseSystem?: string;
  };

  birthDetails: {
    dateOfBirth: string;
    timeOfBirth: string;
    placeOfBirth: string;
    latitude: number;
    longitude: number;
    timezone: string;
    birthTimeAccuracy?: string;
  };

  lagna: LagnaData;

  rashi: RashiData;

  nakshatra: NakshatraData;

  planets: PlanetData[];

  houses: HouseData[];

  dashas?: DashaData;

  divisionalCharts?: DivisionalChartData;

  doshas?: DoshaData;

  rawProviderData?: unknown;

  createdAt: string;
  updatedAt: string;
}
```

---

# 12. Rashi Data

```typescript
interface RashiData {
  name: string;
  index: number;
  lord: string;
}
```

Rashi must be represented consistently.

Recommended index:

```text
0 Aries
1 Taurus
2 Gemini
3 Cancer
4 Leo
5 Virgo
6 Libra
7 Scorpio
8 Sagittarius
9 Capricorn
10 Aquarius
11 Pisces
```

---

# 13. Nakshatra Data

```typescript
interface NakshatraData {
  name: string;
  index: number;
  pada?: number;
  lord?: string;
}
```

Use canonical Nakshatra ordering.

---

# 14. Planet Schema

```typescript
interface PlanetData {
  planet: string;

  longitude?: number;
  latitude?: number;

  sign: string;
  signIndex: number;

  house?: number;

  degree?: number;

  nakshatra?: string;
  nakshatraPada?: number;

  retrograde?: boolean;

  combust?: boolean;

  dignity?: string;
}
```

Do not invent unavailable fields.

Use `null` rather than fabricated values.

---

# 15. House Schema

```typescript
interface HouseData {
  house: number;

  sign?: string;
  signIndex?: number;

  degreeStart?: number;
  degreeEnd?: number;

  lord?: string;

  planets?: string[];
}
```

---

# 16. Dasha Schema

If Navamsha supplies Dasha data:

```typescript
interface DashaData {
  system?: string;

  current?: {
    mahadasha?: string;
    antardasha?: string;
    startDate?: string;
    endDate?: string;
  };

  periods?: DashaPeriod[];
}
```

Do not require Dasha if the selected Navamsha endpoint does not provide it.

---

# 17. Gotra

Gotra is a profile attribute.

```typescript
interface GotraData {
  personGotra?: string;
  partnerGotra?: string;

  status:
    | "same"
    | "different"
    | "unknown";
}
```

Never infer Gotra from astrology.

The traditional interpretation/rule must be configurable.

---

# 18. Astrology Provider Abstraction

Create:

```typescript
interface AstrologyProvider {
  getKundli(
    birthDetails: BirthDetails
  ): Promise<Kundli>;

  getCompatibility?(
    personA: Kundli,
    personB: Kundli
  ): Promise<ProviderCompatibility>;
}
```

Implementation:

```typescript
class NavamshaProvider implements AstrologyProvider {
  ...
}
```

This allows a future provider to be added without changing the matching engine.

---

# 19. Navamsha Client

Create:

```typescript
interface NavamshaClient {
  getBasicKundli(
    birthDetails: BirthDetails
  ): Promise<unknown>;

  getExtendedKundli?(
    birthDetails: BirthDetails
  ): Promise<unknown>;

  getManglik?(
    birthDetails: BirthDetails
  ): Promise<unknown>;

  getCompatibility?(
    personA: BirthDetails,
    personB: BirthDetails
  ): Promise<unknown>;
}
```

IMPORTANT:

Use the current Navamsha Swagger/OpenAPI documentation as the authoritative source for exact request parameters and endpoint paths.

Do not invent undocumented request parameters.

---

# 20. Provider Response Normalization

The Navamsha response must be transformed into our canonical internal format.

Function:

```typescript
function normalizeKundli(
  providerData: unknown
): Kundli
```

Requirements:

* preserve source data internally
* normalize naming
* normalize planet names
* normalize signs
* normalize Nakshatras
* normalize house numbers
* normalize missing values
* record provider metadata
* record calculation methodology
* record timestamps

---

# 21. Kundli Caching

Generate a deterministic hash from:

```text
dateOfBirth
timeOfBirth
latitude
longitude
timezone
astrology methodology
```

Example:

```typescript
function generateBirthDataHash(
  birthDetails: BirthDetails
): string
```

If the same birth data already exists:

```text
DO NOT call Navamsha again.
```

This is required to minimize API usage.

---

# 22. Compatibility Engine

Create:

```typescript
interface MatchEngine {
  calculate(
    personA: Kundli,
    personB: Kundli,
    options?: MatchOptions
  ): CompatibilityResult;
}
```

No LLM calls inside the matching engine.

The matching engine must be deterministic.

Same input must produce same output.

---

# 23. Compatibility Result

```typescript
interface CompatibilityResult {
  matchId: string;

  algorithmVersion: string;

  astrology: {
    provider: string;
    methodology: string;
    ayanamsha: string;
  };

  gunaMilan: GunaMilanResult;

  rashi: CompatibilityFactor;

  nakshatra: CompatibilityFactor;

  gana: CompatibilityFactor;

  gotra: CompatibilityFactor;

  manglik: ManglikResult;

  emotional: CompatibilityScore;

  communication: CompatibilityScore;

  family: CompatibilityScore;

  lifestyle: CompatibilityScore;

  financial: CompatibilityScore;

  career: CompatibilityScore;

  longTerm: CompatibilityScore;

  overall: OverallScore;

  favorableFactors: FactorExplanation[];

  cautionFactors: FactorExplanation[];

  metadata: MatchMetadata;
}
```

---

# 24. Standard Compatibility Factor

```typescript
interface CompatibilityFactor {
  status:
    | "highly_favorable"
    | "favorable"
    | "neutral"
    | "caution"
    | "strong_caution"
    | "unknown";

  score?: number;
  maximumScore?: number;

  percentage?: number;

  explanationCode?: string;

  evidence: string[];

  confidence:
    | "high"
    | "medium"
    | "low";
}
```

Do not force a score where no defensible scoring methodology exists.

---

# 25. Guna Milan

Implement the eight classical Kootas:

```text
Varna
Vashya
Tara
Yoni
Graha Maitri
Gana
Bhakoot
Nadi
```

Maximum:

```text
36 points
```

Schema:

```typescript
interface GunaMilanResult {
  score: number;
  maximumScore: 36;
  percentage: number;

  varna: KootaResult;
  vashya: KootaResult;
  tara: KootaResult;
  yoni: KootaResult;
  grahaMaitri: KootaResult;
  gana: KootaResult;
  bhakoot: KootaResult;
  nadi: KootaResult;

  interpretation: string;
}
```

---

# 26. Koota Result

```typescript
interface KootaResult {
  score: number;
  maximumScore: number;

  status:
    | "favorable"
    | "neutral"
    | "caution"
    | "strong_caution";

  personAValue: string;
  personBValue: string;

  explanationCode?: string;

  evidence: string[];
}
```

The numerical values must come from deterministic logic or the authoritative provider calculation.

Gemma must never modify these values.

---

# 27. Guna Milan Validation

If Navamsha provides an Ashtakoot result, compare it with our normalized calculation where possible.

Store:

```typescript
interface ProviderCrossCheck {
  providerScore?: number;
  internalScore?: number;
  difference?: number;

  status:
    | "matched"
    | "minor_difference"
    | "major_difference"
    | "not_available";
}
```

If a difference occurs, do not silently overwrite it.

Log it for investigation.

---

# 28. Rashi Compatibility

Create:

```typescript
function calculateRashiCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityFactor
```

Input:

```text
Person A Moon Rashi
Person B Moon Rashi
```

Potential considerations:

* sign relationship
* traditional Vedic relationship
* lord relationship
* compatibility methodology

The methodology must be documented.

Do not create arbitrary rules merely to produce a score.

---

# 29. Nakshatra Compatibility

Create:

```typescript
function calculateNakshatraCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityFactor
```

Use:

```text
Nakshatra
Pada where relevant
Traditional relationship
Tara considerations where applicable
```

Do not duplicate Tara blindly if it is already part of Guna Milan.

---

# 30. Gana Compatibility

Create:

```typescript
function calculateGanaCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityFactor
```

Traditional categories:

```text
Deva
Manushya
Rakshasa
```

Use the canonical Nakshatra-to-Gana mapping.

Gana inside the detailed report should be consistent with Gana Koota.

---

# 31. Gotra Compatibility

Create:

```typescript
function calculateGotraCompatibility(
  gotraA?: string,
  gotraB?: string
): CompatibilityFactor
```

Rules:

```text
same gotra
different gotra
unknown gotra
```

Never infer it from Kundli.

The output must explicitly distinguish:

```text
astrological factor
```

from:

```text
traditional family/matrimonial convention
```

---

# 32. Manglik

Create:

```typescript
function calculateManglikCompatibility(
  personA: Kundli,
  personB: Kundli
): ManglikResult
```

Schema:

```typescript
interface ManglikResult {
  personA: {
    isManglik: boolean;
    source: "navamsha" | "internal";
    details?: string[];
  };

  personB: {
    isManglik: boolean;
    source: "navamsha" | "internal";
    details?: string[];
  };

  compatibilityStatus:
    | "compatible"
    | "caution"
    | "strong_caution"
    | "unknown";

  cancellationFactors?: string[];

  explanation?: string;
}
```

Do not make an absolute marital prediction based solely on Manglik status.

---

# 33. Emotional Compatibility

Create:

```typescript
function calculateEmotionalCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityScore
```

Potential data:

```text
Moon sign
Moon Nakshatra
Moon placement
Relevant planetary relationships
Relevant house information
```

Do not allow arbitrary AI-generated scoring.

The score must be derived from a documented rule set.

---

# 34. Communication Compatibility

Create:

```typescript
function calculateCommunicationCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityScore
```

Potential inputs:

```text
Mercury
Moon
relevant signs
relevant houses
planetary relationships
```

Methodology must be documented.

---

# 35. Family Compatibility

Create:

```typescript
function calculateFamilyCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityScore
```

Potential inputs:

```text
4th house
2nd house
Moon
Venus/Jupiter where methodology specifies
relevant planetary relationships
```

This is a custom product methodology.

Document exactly how the score is calculated.

---

# 36. Lifestyle Compatibility

Create:

```typescript
function calculateLifestyleCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityScore
```

Potential factors:

```text
Rashi
Moon
Venus
Mars
relevant houses
```

No arbitrary AI score generation.

---

# 37. Financial / Wealth Alignment

Create:

```typescript
function calculateFinancialCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityScore
```

Important:

This does NOT mean:

> "These people will definitely become rich."

Instead it represents:

> traditional astrological indicators related to financial attitudes, earning tendencies, resource management, and financial alignment.

Potential inputs may include:

```text
2nd house
11th house
10th house
9th house
Jupiter
Venus
Mercury
relevant planetary relationships
Dasha information where supported
```

The methodology must be explicitly documented.

No absolute financial predictions.

---

# 38. Career Compatibility

Create:

```typescript
function calculateCareerCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityScore
```

Potential inputs:

```text
10th house
6th house
2nd house
11th house
Sun
Saturn
Mercury
Jupiter
```

Again, this is a traditional interpretive framework, not a scientifically validated prediction.

---

# 39. Long-Term Compatibility

Create:

```typescript
function calculateLongTermCompatibility(
  personA: Kundli,
  personB: Kundli
): CompatibilityScore
```

Potential inputs:

```text
overall chart relationship
Moon
Venus
Mars
Jupiter
7th house
7th lord
relevant divisional charts if available
Dasha synchronization if methodology supports it
```

The methodology must be deterministic and versioned.

---

# 40. Compatibility Score

Use:

```typescript
interface CompatibilityScore {
  score: number;
  maximumScore: 100;

  status:
    | "excellent"
    | "good"
    | "moderate"
    | "caution"
    | "insufficient_data";

  factors: string[];

  evidence: string[];

  confidence:
    | "high"
    | "medium"
    | "low";
}
```

Normalize scores to:

```text
0–100
```

---

# 41. Overall Score

Create:

```typescript
function calculateOverallScore(
  compatibility: CompatibilityResult
): OverallScore
```

Schema:

```typescript
interface OverallScore {
  score: number;
  maximumScore: 100;

  category:
    | "excellent"
    | "very_good"
    | "good"
    | "moderate"
    | "caution"
    | "insufficient_data";

  confidence:
    | "high"
    | "medium"
    | "low";

  methodologyVersion: string;
}
```

---

# 42. Recommended Initial Weighting

Weights must be configurable.

Initial proposal:

```text
Guna Milan             25%
Rashi                  10%
Nakshatra               5%
Gana                    5%
Gotra                   5%
Manglik                 10%
Emotional               10%
Communication           8%
Family                  7%
Lifestyle               5%
Financial               5%
Career                  2%
Long-term               3%
--------------------------------
Total                  100%
```

IMPORTANT:

These weights are product methodology, not an established universal Vedic standard.

Store them in:

```text
matching/scoring/weights.ts
```

Never hardcode weights throughout individual calculators.

---

# 43. Missing Data Handling

If a factor cannot be calculated:

DO NOT:

```text
score = 0
```

unless zero is actually the calculated result.

Instead:

```typescript
{
  score: null,
  status: "insufficient_data",
  confidence: "low"
}
```

Overall scoring must distinguish:

```text
actual poor compatibility
```

from:

```text
missing information
```

---

# 44. Evidence-Based Scoring

Every score should be traceable.

Example:

```json
{
  "score": 82,
  "factors": [
    "Moon-sign relationship",
    "Nakshatra relationship",
    "7th-house indicators"
  ],
  "evidence": [
    "Person A Moon in ...",
    "Person B Moon in ..."
  ]
}
```

This makes debugging possible.

---

# 45. Compatibility Report Input to AI

Create:

```typescript
function buildAIInput(
  compatibility: CompatibilityResult
): AICompatibilityInput
```

Do not send unnecessary personal information.

Example:

```typescript
interface AICompatibilityInput {
  methodology: {
    astrologySystem: string;
    ayanamsha: string;
    algorithmVersion: string;
  };

  gunaMilan: GunaMilanResult;

  factors: {
    rashi: CompatibilityFactor;
    nakshatra: CompatibilityFactor;
    gana: CompatibilityFactor;
    gotra: CompatibilityFactor;
    manglik: ManglikResult;
    emotional: CompatibilityScore;
    communication: CompatibilityScore;
    family: CompatibilityScore;
    lifestyle: CompatibilityScore;
    financial: CompatibilityScore;
    career: CompatibilityScore;
    longTerm: CompatibilityScore;
  };

  overall: OverallScore;

  favorableFactors: FactorExplanation[];
  cautionFactors: FactorExplanation[];
}
```

---

# 46. OpenRouter Integration

Create:

```typescript
interface AIProvider {
  generateCompatibilityReport(
    input: AICompatibilityInput
  ): Promise<AIReport>;
}
```

Implementation:

```typescript
class OpenRouterProvider implements AIProvider {
  ...
}
```

Model:

```text
google/gemma-4-31b-it:free
```

Keep the model configurable through:

```env
OPENROUTER_MODEL=
```

---

# 47. AI Prompt

System prompt:

```text
You are a Vedic astrology compatibility report-generation engine.

The astrology calculations supplied to you have already been
performed by a deterministic astrology and compatibility engine.

You MUST NOT recalculate any astrology values.

You MUST NOT:
- recalculate planetary positions
- recalculate Kundli values
- recalculate Guna Milan
- change numerical scores
- invent missing data
- invent planetary placements
- invent Gotra information
- create unsupported compatibility scores
- contradict the supplied structured data

Your task is to explain the supplied compatibility results
in clear, balanced, accessible language.

The report should explain:

1. Overall compatibility
2. Guna Milan
3. Rashi compatibility
4. Nakshatra compatibility
5. Gana compatibility
6. Gotra compatibility
7. Manglik
8. Emotional compatibility
9. Communication compatibility
10. Family compatibility
11. Lifestyle compatibility
12. Financial/wealth alignment
13. Career compatibility
14. Long-term compatibility
15. Reasons the match appears favorable
16. Areas requiring caution
17. Final balanced assessment

Important:

Astrological interpretations must be presented as traditional
Vedic astrology interpretations, not scientific certainty.

Never make absolute claims such as:
- "They will definitely divorce."
- "They will definitely become rich."
- "They will definitely have children."
- "This marriage will definitely fail."
- "This marriage is guaranteed to succeed."

Use language such as:
- "The traditional interpretation suggests..."
- "This may indicate..."
- "This factor is generally considered favorable..."
- "This is traditionally viewed as an area requiring attention..."

Do not provide medical, legal, or financial professional advice.

If information is missing, explicitly state that it is unavailable.

Never manufacture an answer to fill missing information.

Return ONLY the requested JSON structure.
```

---

# 48. AI Report Schema

```typescript
interface AIReport {
  reportVersion: string;

  summary: string;

  overallInterpretation: string;

  gunaMilan: {
    summary: string;
    interpretation: string;
  };

  rashiAnalysis: string;

  nakshatraAnalysis: string;

  ganaAnalysis: string;

  gotraAnalysis: string;

  manglikAnalysis: string;

  emotionalAnalysis: string;

  communicationAnalysis: string;

  familyAnalysis: string;

  lifestyleAnalysis: string;

  financialAnalysis: string;

  careerAnalysis: string;

  longTermAnalysis: string;

  favorableFactors: string[];

  cautionFactors: string[];

  practicalConsiderations: string[];

  finalAssessment: string;
}
```

---

# 49. AI Must Not Generate Numerical Scores

This is mandatory.

Numerical values come from:

```text
Compatibility Engine
```

not:

```text
Gemma
```

For example, if the compatibility engine says:

```text
financial = 82
```

Gemma must explain 82.

It must not output:

```text
financial = 91
```

If an AI response contains contradictory numerical values, reject or sanitize the response.

Preferably, numerical fields should not even exist in the AI output schema.

---

# 50. AI Output Validation

Create:

```typescript
function validateAIReport(
  data: unknown
): AIReport
```

Validation must verify:

* required fields exist
* strings are strings
* arrays are arrays
* no unexpected required numerical compatibility scores
* no null where prohibited
* valid JSON
* maximum text lengths

If validation fails:

```text
retry once
```

If it still fails:

```text
return deterministic compatibility result
without AI report
```

The entire matchmaking API must not fail merely because the LLM failed.

---

# 51. AI Failure Strategy

Possible failure:

```text
OpenRouter timeout
OpenRouter rate limit
model unavailable
invalid JSON
provider error
```

Response should still contain:

```json
{
  "success": true,
  "match": {
    "...": "deterministic compatibility data"
  },
  "aiReport": null,
  "aiStatus": "unavailable"
}
```

Never fabricate an AI report.

---

# 52. Matchmaking Pipeline

Create:

```typescript
async function runMatchmakingPipeline(
  request: MatchRequest
): Promise<MatchResponse>
```

Pipeline:

```text
1. Validate request

2. Resolve Person A Kundli

3. Resolve Person B Kundli

4. Fetch missing Kundlis from Navamsha

5. Normalize Kundli data

6. Store/cache Kundlis

7. Calculate Guna Milan

8. Calculate Rashi

9. Calculate Nakshatra

10. Calculate Gana

11. Calculate Gotra

12. Calculate Manglik

13. Calculate Emotional

14. Calculate Communication

15. Calculate Family

16. Calculate Lifestyle

17. Calculate Financial

18. Calculate Career

19. Calculate Long-Term

20. Calculate Overall Score

21. Build AI input

22. Call Gemma

23. Validate AI output

24. Persist match

25. Persist AI report

26. Return final response
```

---

# 53. Match Request

Support:

```typescript
interface MatchRequest {
  personA: PersonReference;
  personB: PersonReference;

  options?: {
    generateAIReport?: boolean;
    language?: string;
    forceRefresh?: boolean;
  };
}
```

Person reference:

```typescript
interface PersonReference {
  userId?: string;
  kundliId?: string;
  birthDetails?: BirthDetails;
}
```

At least one valid identification method must exist.

---

# 54. Recommended External API

## POST `/api/v1/kundli`

Purpose:

Create/retrieve a Kundli.

Request:

```json
{
  "externalUserId": "user-123",
  "birthDetails": {
    "dateOfBirth": "1998-05-12",
    "timeOfBirth": "14:35:00",
    "placeOfBirth": "Vadodara, Gujarat, India",
    "latitude": 22.3072,
    "longitude": 73.1812,
    "timezone": "Asia/Kolkata",
    "birthTimeAccuracy": "exact",
    "gotra": "..."
  }
}
```

Response:

```json
{
  "success": true,
  "kundliId": "kundli_123",
  "provider": "navamsha",
  "algorithmVersion": "1.0.0",
  "kundli": {}
}
```

---

# 55. Recommended External API

## POST `/api/v1/match`

Purpose:

Generate compatibility result between two people.

Request:

```json
{
  "personA": {
    "kundliId": "kundli_123",
    "gotra": "..."
  },
  "personB": {
    "kundliId": "kundli_456",
    "gotra": "..."
  },
  "options": {
    "generateAIReport": true,
    "language": "en"
  }
}
```

---

# 56. Match Response

```json
{
  "success": true,

  "matchId": "match_123",

  "metadata": {
    "algorithmVersion": "1.0.0",
    "promptVersion": "1.0.0",
    "astrologyProvider": "navamsha",
    "aiProvider": "openrouter",
    "aiModel": "google/gemma-4-31b-it:free",
    "createdAt": "2026-01-01T00:00:00Z"
  },

  "scores": {
    "overall": 78,
    "gunaMilan": 28,
    "emotional": 82,
    "communication": 76,
    "family": 71,
    "lifestyle": 75,
    "financial": 84,
    "career": 70,
    "longTerm": 79
  },

  "compatibility": {
    "gunaMilan": {},
    "rashi": {},
    "nakshatra": {},
    "gana": {},
    "gotra": {},
    "manglik": {},
    "emotional": {},
    "communication": {},
    "family": {},
    "lifestyle": {},
    "financial": {},
    "career": {},
    "longTerm": {}
  },

  "aiReport": {
    "summary": "...",
    "overallInterpretation": "...",
    "gunaMilan": {},
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
    "favorableFactors": [],
    "cautionFactors": [],
    "practicalConsiderations": [],
    "finalAssessment": "..."
  }
}
```

---

# 57. Optional Endpoint

## GET `/api/v1/match/:matchId`

Returns a previously generated match.

This should not recalculate anything unless explicitly requested.

---

# 58. Optional Endpoint

## GET `/api/v1/kundli/:kundliId`

Returns a previously generated Kundli.

No new Navamsha request.

---

# 59. Health Endpoint

## GET `/health`

Response:

```json
{
  "status": "ok",
  "service": "ai-matchmaking",
  "version": "1.0.0"
}
```

Optional:

```text
GET /health/providers
```

Response:

```json
{
  "navamsha": "configured",
  "openrouter": "configured",
  "database": "connected"
}
```

Do not expose API keys.

---

# 60. Database Design

Use PostgreSQL.

## Table: `birth_profiles`

Fields:

```text
id
external_user_id
date_of_birth
time_of_birth
place_of_birth
latitude
longitude
timezone
birth_time_accuracy
gotra
birth_data_hash
created_at
updated_at
```

---

# 61. Table: `kundli_charts`

Fields:

```text
id
birth_profile_id
provider
provider_version
methodology
ayanamsha
chart_json
raw_provider_json
created_at
updated_at
```

Indexes:

```text
birth_data_hash
birth_profile_id
```

---

# 62. Table: `compatibility_matches`

Fields:

```text
id
person_a_kundli_id
person_b_kundli_id

algorithm_version

overall_score
guna_score

compatibility_json

created_at
updated_at
```

Create an index/unique constraint allowing efficient retrieval of:

```text
person A ↔ person B
```

Normalize pair ordering if necessary:

```text
smaller ID = person A
larger ID = person B
```

This prevents duplicate match records.

---

# 63. Table: `ai_reports`

Fields:

```text
id
match_id
provider
model
prompt_version
language
report_json
created_at
updated_at
```

Unique combination:

```text
match_id
language
prompt_version
model
```

This allows report reuse.

---

# 64. Match Caching

Before calculating a match:

```text
check:
personA + personB + algorithmVersion
```

If an identical match already exists:

```text
return cached match
```

Do not call:

```text
Navamsha
or
OpenRouter
```

again unnecessarily.

---

# 65. AI Report Caching

Before calling Gemma:

```text
check:
matchId
+
promptVersion
+
model
+
language
```

If report exists:

```text
return stored report
```

---

# 66. Idempotency

Support optional:

```http
Idempotency-Key
```

on expensive operations.

Particularly:

```text
POST /match
POST /kundli
```

This prevents duplicate API calls if the external website retries a request.

---

# 67. Error Format

All errors should use:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_BIRTH_DATA",
    "message": "Invalid birth time.",
    "details": {}
  }
}
```

Never return stack traces in production.

---

# 68. Error Codes

Define:

```text
INVALID_REQUEST
INVALID_BIRTH_DATA
INVALID_LOCATION
INVALID_TIMEZONE

KUNDLI_NOT_FOUND
KUNDLI_CALCULATION_FAILED
KUNDLI_PROVIDER_TIMEOUT
KUNDLI_PROVIDER_RATE_LIMIT

MATCH_INVALID
MATCH_CALCULATION_FAILED
INSUFFICIENT_DATA

AI_PROVIDER_ERROR
AI_PROVIDER_TIMEOUT
AI_RATE_LIMIT
AI_INVALID_OUTPUT
AI_REPORT_GENERATION_FAILED

DATABASE_ERROR
INTERNAL_ERROR
```

---

# 69. Unit Testing Requirements

Every deterministic calculator must have unit tests.

Minimum:

```text
Guna Milan
Varna
Vashya
Tara
Yoni
Graha Maitri
Gana
Bhakoot
Nadi

Rashi
Nakshatra
Gotra
Manglik

Emotional
Communication
Family
Lifestyle
Financial
Career
Long-term

Overall scoring
```

---

# 70. Guna Milan Tests

Test:

```text
perfect compatibility
partial compatibility
zero compatibility
boundary values
invalid values
unknown values
```

Verify:

```text
score >= 0
score <= maximum
```

Verify:

```text
sum of eight Kootas = total Guna score
```

---

# 71. Score Tests

For every score:

```text
0 <= score <= 100
```

Test:

```text
100
0
50
null
missing data
```

Test weighted overall score.

Example:

```text
overall =
sum(
 factorScore * factorWeight
)
```

with total weights equal to:

```text
1.0
```

or:

```text
100
```

depending on implementation.

---

# 72. Weight Validation Test

Automatically fail if:

```text
sum(weights) != 100
```

Example:

```typescript
expect(totalWeight).toBe(100);
```

---

# 73. Determinism Test

Run the same input 100 times.

Expected:

```text
identical deterministic output
```

AI output is excluded from strict equality testing.

---

# 74. AI Tests

Do not test whether Gemma "is astrologically correct."

Test:

```text
valid JSON
schema compliance
required fields
no numerical contradictions
no hallucinated values
missing-data handling
prompt compliance
```

---

# 75. AI Contradiction Test

Input:

```json
{
  "financial": {
    "score": 82
  }
}
```

If Gemma produces:

```text
"Financial compatibility is 91/100"
```

the validator must reject or sanitize it.

---

# 76. AI Missing Data Test

Input:

```json
{
  "career": {
    "score": null,
    "status": "insufficient_data"
  }
}
```

Expected:

```text
AI explains that career compatibility could not be assessed reliably.
```

It must not invent a score.

---

# 77. Security Tests

Test:

```text
SQL injection
malformed JSON
oversized request
invalid date
invalid coordinates
invalid timezone
API key exposure
stack trace exposure
prompt injection through input fields
```

---

# 78. Prompt Injection Protection

Although the application is not a chatbot, user-controlled fields can still contain text.

Treat all profile text as untrusted.

Especially:

```text
Gotra
placeOfBirth
externalUserId
```

The AI prompt must clearly separate:

```text
trusted compatibility data
```

from:

```text
untrusted user strings
```

Never allow a user-controlled string to become a system instruction.

---

# 79. AI Privacy

Do not send to OpenRouter unless required:

```text
name
email
phone
user ID
home address
```

Prefer sending:

```text
astrological values
compatibility values
evidence
```

The AI report should be based on anonymous Person A / Person B labels.

---

# 80. Observability

Log:

```text
request ID
endpoint
duration
Navamsha duration
matching duration
AI duration
database duration
algorithm version
AI model
success/failure
```

Do NOT log:

```text
API keys
full birth data
email
phone
sensitive personal data
full AI prompt in production unless explicitly approved
```

---

# 81. Request IDs

Every request should receive:

```text
X-Request-ID
```

If provided by the external application, preserve it.

Otherwise generate one.

---

# 82. AI Token Optimization

Keep AI input compact.

Do not send raw Navamsha JSON if it contains unnecessary fields.

Build:

```typescript
AICompatibilityInput
```

specifically for report generation.

Use one AI call per report.

Avoid:

```text
one call for Rashi
one call for Gana
one call for finances
one call for emotions
...
```

Preferred:

```text
one compatibility input
        ↓
one Gemma call
        ↓
complete report
```

---

# 83. AI Retry Strategy

Maximum:

```text
2 retries
```

Retry only for:

```text
timeout
temporary provider failure
rate limit where retry-after permits
invalid structured response
```

Do not endlessly retry.

---

# 84. AI Fallback

The deterministic compatibility response must always be independently usable.

If AI fails:

```json
{
  "success": true,
  "scores": {},
  "compatibility": {},
  "aiReport": null,
  "aiStatus": "unavailable"
}
```

The frontend can display:

```text
Compatibility calculated successfully.
Detailed AI explanation is temporarily unavailable.
```

---

# 85. Language Support

Design the AI report for future multilingual support.

Request:

```json
{
  "options": {
    "language": "en"
  }
}
```

Potential future values:

```text
en
hi
gu
mr
bn
ta
te
kn
ml
```

Do not hardcode English into the architecture.

---

# 86. AI Language Instruction

The system prompt should include:

```text
Generate the report in the requested language.

Preserve:
- numerical values
- astrology terminology
- section meaning
- structured schema
```

---

# 87. Report Sections

The final report should contain:

```text
1. Overall Summary

2. Overall Compatibility

3. Guna Milan

4. Rashi Compatibility

5. Nakshatra Compatibility

6. Gana Compatibility

7. Gotra Compatibility

8. Manglik Analysis

9. Emotional Compatibility

10. Communication Compatibility

11. Family Compatibility

12. Lifestyle Compatibility

13. Financial / Wealth Alignment

14. Career Compatibility

15. Long-Term Compatibility

16. Why This Match Looks Favorable

17. Areas Requiring Caution

18. Practical Relationship Considerations

19. Final Balanced Assessment
```

---

# 88. "Yes/No" Handling

Do not expose the system as:

```text
YES = marry
NO = don't marry
```

Instead use:

```text
overall category
strengths
cautions
considerations
```

The final report must explicitly avoid presenting astrology as a guaranteed decision-making authority.

---

# 89. Recommended Frontend-Friendly Output

The API should make it easy for a frontend to display:

```text
Overall Compatibility
78 / 100

Guna Milan
28 / 36

Emotional
82 / 100

Communication
76 / 100

Family
71 / 100

Lifestyle
75 / 100

Financial
84 / 100

Long-Term
79 / 100
```

Then:

```text
WHY FAVORABLE

✓ ...
✓ ...
✓ ...

AREAS OF CAUTION

⚠ ...
⚠ ...
⚠ ...
```

The frontend should not have to calculate anything.

---

# 90. API Contract Principle

The external website should never need to know the internal implementation.

It should not matter whether the internal service uses:

```text
Navamsha
another astrology provider
Gemma
another LLM
PostgreSQL
another database
```

The public contract remains:

```text
INPUT
  ↓
/api/v1/kundli
/api/v1/match
  ↓
OUTPUT
```

---

# 91. Provider Abstraction

Astrology:

```typescript
interface AstrologyProvider {
  getKundli(...): Promise<Kundli>;
}
```

AI:

```typescript
interface AIProvider {
  generateCompatibilityReport(...): Promise<AIReport>;
}
```

This is mandatory.

---

# 92. Configuration Abstraction

Never hardcode:

```text
weights
provider
model
prompt
algorithm version
```

Use configuration.

Example:

```typescript
const config = {
  astrologyProvider: "navamsha",

  aiProvider: "openrouter",

  aiModel: process.env.OPENROUTER_MODEL,

  algorithmVersion: process.env.ALGORITHM_VERSION,

  promptVersion: process.env.PROMPT_VERSION
};
```

---

# 93. Algorithm Versioning

Every compatibility result must include:

```text
algorithmVersion
```

Example:

```text
1.0.0
```

If scoring changes:

```text
1.1.0
```

If a breaking methodology change occurs:

```text
2.0.0
```

Old match records must remain reproducible.

---

# 94. Prompt Versioning

Every AI report must include:

```text
promptVersion
```

Example:

```text
1.0.0
```

If the report prompt changes:

```text
1.1.0
```

Do not overwrite historical reports without preserving the version.

---

# 95. Astrology Methodology Versioning

Store:

```text
astrologyProvider
providerVersion
ayanamsha
methodology
```

Example:

```json
{
  "provider": "navamsha",
  "methodology": "vedic",
  "ayanamsha": "lahiri"
}
```

---

# 96. Deterministic Rules Registry

Create:

```typescript
interface RuleDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}
```

Example:

```text
RASHI-001
GANA-001
NADI-001
BHAKOOT-001
MANGALIK-001
FINANCIAL-001
EMOTIONAL-001
```

This allows individual rules to evolve.

---

# 97. Match Evidence

Each compatibility factor must produce evidence.

Example:

```json
{
  "financial": {
    "score": 84,
    "evidence": [
      "2nd-house indicators",
      "11th-house indicators",
      "Jupiter relationship"
    ]
  }
}
```

This evidence is passed to Gemma.

Gemma explains the evidence.

---

# 98. AI Hallucination Boundary

Gemma may:

```text
interpret supplied evidence
connect supplied factors
write prose
summarize
translate
prioritize strengths/cautions
```

Gemma may NOT:

```text
invent evidence
invent planets
invent houses
invent scores
invent Gotra
invent birth information
invent Dasha periods
```

---

# 99. Performance Requirements

Target:

```text
Kundli cache hit:
< 100 ms internal processing

Deterministic matching:
< 500 ms target

AI report:
provider-dependent

Full match:
primarily limited by Navamsha/OpenRouter latency
```

Do not block the architecture on these exact numbers.

Measure real performance.

---

# 100. Rate Limiting

At minimum:

```text
POST /kundli
POST /match
```

must have rate limits.

Do not allow unlimited public requests to consume:

```text
Navamsha quota
OpenRouter quota
```

---

# 101. Database Connection Handling

Use a connection pool.

Do not create a new database connection per request.

---

# 102. External API Timeouts

Navamsha:

```text
~15 seconds maximum
```

OpenRouter:

```text
~30 seconds maximum
```

Make these configurable.

---

# 103. Provider Retry

Navamsha retry:

```text
maximum 2 retries
```

OpenRouter retry:

```text
maximum 2 retries
```

Use exponential backoff where appropriate.

---

# 104. No Hidden Calculations

Every score must have a visible function.

Example:

```text
calculateRashiCompatibility()
calculateGanaCompatibility()
calculateFinancialCompatibility()
```

Do not bury major business logic inside:

```text
controllers
routes
AI prompts
```

---

# 105. No Business Logic in Routes

Routes should call controllers.

Controllers should call services.

Services should call:

```text
providers
matching engine
repositories
```

---

# 106. Recommended Service Layer

```text
KundliService
MatchService
ReportService
AstrologyService
AIReportService
```

Example:

```typescript
class MatchService {
  async createMatch(
    request: MatchRequest
  ): Promise<MatchResponse> {
    ...
  }
}
```

---

# 107. Recommended Pipeline Classes

```typescript
class KundliPipeline {
  async execute(
    birthDetails: BirthDetails
  ): Promise<Kundli> {
    ...
  }
}
```

```typescript
class MatchmakingPipeline {
  async execute(
    request: MatchRequest
  ): Promise<MatchResponse> {
    ...
  }
}
```

---

# 108. Testing Fixtures

Create fixed synthetic test profiles.

Do not use real people's personal data in the repository.

Example:

```json
{
  "dateOfBirth": "1990-01-15",
  "timeOfBirth": "10:30:00",
  "placeOfBirth": "Test City",
  "latitude": 20.0,
  "longitude": 73.0,
  "timezone": "Asia/Kolkata"
}
```

Use multiple fixture pairs covering:

```text
high compatibility
medium compatibility
low compatibility
same gotra
different gotra
Manglik/non-Manglik
missing birth time
missing Gotra
```

---

# 109. Integration Tests

Navamsha integration tests should be separated from unit tests.

Do not require a live Navamsha API for every CI run.

Use:

```text
mock provider
```

for normal CI.

Use live API tests only when explicitly enabled:

```env
RUN_LIVE_PROVIDER_TESTS=true
```

---

# 110. OpenRouter Integration Tests

Likewise, normal tests should mock:

```text
OpenRouterProvider
```

Use a live AI test only when explicitly enabled.

---

# 111. Contract Tests

The final API must have contract tests ensuring:

```text
POST /api/v1/kundli
```

always follows its schema.

And:

```text
POST /api/v1/match
```

always follows its schema.

This is especially important because the existing website will depend on these contracts.

---

# 112. Final External Contract

The eventual website integration should require only:

```text
AI_SERVICE_URL
```

and API authentication if enabled.

Example:

```env
AI_MATCHMAKING_URL=https://ai.example.com
AI_MATCHMAKING_API_KEY=
```

Website sends:

```http
POST /api/v1/match
```

and receives:

```json
{
  "success": true,
  "matchId": "...",
  "scores": {},
  "compatibility": {},
  "aiReport": {}
}
```

---

# 113. API Documentation

Create:

```text
/ai/docs/API.md
```

Document:

```text
POST /api/v1/kundli
GET /api/v1/kundli/:id
POST /api/v1/match
GET /api/v1/match/:id
GET /health
```

For each:

* request
* response
* errors
* authentication
* examples

---

# 114. Astrology Data Dictionary

Create:

```text
/ai/docs/ASTROLOGY_DATA_DICTIONARY.md
```

Document every internal field:

```text
lagna
rashi
nakshatra
pada
planet
house
dasha
dosha
varna
vashya
tara
yoni
graha maitri
gana
bhakoot
nadi
manglik
```

For each field document:

```text
name
type
source
meaning
required/optional
normalization
```

---

# 115. Matching Methodology

Create:

```text
/ai/docs/MATCHING_METHODOLOGY.md
```

For every factor document:

```text
Input fields
Calculation
Formula/rules
Score range
Weight
Interpretation
Missing-data behavior
Version
```

Example:

```text
Financial Compatibility

Inputs:
- 2nd house
- 11th house
- Jupiter
- Venus
- relevant relationships

Output:
0–100

Weight:
5%

Version:
1.0.0
```

---

# 116. Do Not Claim Scientific Certainty

The service must never present astrology as scientifically validated predictive certainty.

The product language should distinguish:

```text
traditional astrological interpretation
```

from:

```text
scientific prediction
```

---

# 117. No Absolute Marriage Decisions

Do not produce:

```text
"Marriage guaranteed"
"Divorce guaranteed"
"Never marry this person"
"100% compatible"
```

Instead:

```text
"Traditionally favorable"
"Areas of caution"
"Potential strengths"
"Factors worth discussing"
```

---

# 118. Financial Safety

The financial compatibility section is:

```text
astrological interpretation
```

not professional financial advice.

Do not provide:

```text
investment recommendations
specific financial products
guaranteed wealth claims
```

---

# 119. Medical/Fertility Safety

Do not make medical predictions.

Do not infer:

```text
fertility
pregnancy
disease
lifespan
death
medical conditions
```

from Kundli.

If such data is absent, keep it absent.

---

# 120. Final Match Status

Do not use only:

```text
YES
NO
```

Recommended:

```text
excellent
very_good
good
moderate
caution
insufficient_data
```

---

# 121. Final Development Sequence

Implement in this exact order.

## Phase 1

Project foundation:

```text
TypeScript
API server
environment configuration
logging
error handling
health endpoint
```

## Phase 2

Astrology provider:

```text
Navamsha client
Navamsha provider
Kundli normalization
Kundli validation
```

## Phase 3

Database:

```text
birth_profiles
kundli_charts
compatibility_matches
ai_reports
```

## Phase 4

Kundli API:

```text
POST /api/v1/kundli
GET /api/v1/kundli/:id
```

## Phase 5

Basic compatibility:

```text
Guna Milan
Rashi
Nakshatra
Gana
Gotra
Manglik
```

## Phase 6

Advanced compatibility:

```text
Emotional
Communication
Family
Lifestyle
Financial
Career
Long-term
```

## Phase 7

Scoring:

```text
weights
overall score
confidence
evidence
```

## Phase 8

AI:

```text
OpenRouter
Gemma
structured output
schema validation
retry/fallback
```

## Phase 9

Match API:

```text
POST /api/v1/match
GET /api/v1/match/:id
```

## Phase 10

Testing:

```text
unit
integration
contract
security
e2e
```

---

# 122. Definition of Done

The project is considered ready for external integration only when:

* [ ] `/ai/` runs independently
* [ ] Navamsha credentials are environment-based
* [ ] OpenRouter credentials are environment-based
* [ ] Kundli calculation works
* [ ] Kundli normalization works
* [ ] Kundli caching works
* [ ] Kundli persistence works
* [ ] Guna Milan works
* [ ] Rashi compatibility works
* [ ] Nakshatra compatibility works
* [ ] Gana compatibility works
* [ ] Gotra compatibility works
* [ ] Manglik works
* [ ] Emotional score works
* [ ] Communication score works
* [ ] Family score works
* [ ] Lifestyle score works
* [ ] Financial score works
* [ ] Career score works
* [ ] Long-term score works
* [ ] Overall score works
* [ ] Every score has evidence
* [ ] Every score has deterministic logic
* [ ] Algorithm version is stored
* [ ] AI input is sanitized
* [ ] Gemma report generation works
* [ ] AI JSON is schema validated
* [ ] AI cannot modify deterministic scores
* [ ] AI failure does not break matchmaking
* [ ] Match caching works
* [ ] AI report caching works
* [ ] API errors are standardized
* [ ] API keys are never exposed
* [ ] Unit tests pass
* [ ] Integration tests pass
* [ ] Contract tests pass
* [ ] E2E test passes
* [ ] API documentation exists
* [ ] Methodology documentation exists
* [ ] Data dictionary exists
* [ ] Existing website can consume `/api/v1/match` without knowing internal implementation

---

# 123. Final Expected Architecture

The finished `/ai/` project must behave as:

```text
                  ┌───────────────────────┐
                  │ EXISTING WEBSITE      │
                  │                       │
                  │ No astrology logic    │
                  │ No AI logic           │
                  └───────────┬───────────┘
                              │
                              │ HTTP
                              ▼
                  ┌───────────────────────┐
                  │ /ai/ SERVICE          │
                  │                       │
                  │ /api/v1/kundli        │
                  │ /api/v1/match         │
                  └───────────┬───────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
       PostgreSQL         Navamsha          OpenRouter
                              │                 │
                              ▼                 ▼
                           Kundli            Gemma
                              │                 │
                              └───────┬─────────┘
                                      ▼
                              Match Report
```

---

# 124. Non-Negotiable Rules

1. **Never expose API keys to the frontend.**

2. **Never use Gemma as the astrology calculator.**

3. **Never allow Gemma to alter deterministic numerical results.**

4. **Never infer Gotra from birth details.**

5. **Never convert missing data into zero compatibility.**

6. **Never make absolute marriage predictions.**

7. **Never make guaranteed wealth predictions.**

8. **Never make medical/fertility/death predictions.**

9. **Never put major business logic inside an API controller.**

10. **Never hardcode provider-specific logic into the matching engine.**

11. **Never hardcode AI model selection into business logic.**

12. **Always version the algorithm.**

13. **Always version the AI prompt.**

14. **Always store the methodology used for a match.**

15. **Always cache Kundli data.**

16. **Always cache generated AI reports.**

17. **Always maintain a deterministic compatibility result independent of AI.**

18. **Always validate external API responses.**

19. **Always validate AI output against a schema.**

20. **The public API contract must remain independent of internal providers.**

---

# 125. Final Integration Contract

The existing website should ultimately need only:

### Create Kundli

```http
POST /api/v1/kundli
```

### Match two users

```http
POST /api/v1/match
```

### Retrieve existing match

```http
GET /api/v1/match/:matchId
```

The website should never need to know:

```text
Navamsha endpoint details
OpenRouter endpoint details
Gemma prompt
matching formulas
scoring weights
database structure
AI schemas
provider implementation
```

Those belong entirely inside `/ai/`.

---

# 126. Implementation Instruction for Antigravity

Implement this specification incrementally.

Before implementing any undocumented astrology calculation:

1. Inspect the current Navamsha API documentation/OpenAPI specification.
2. Identify the exact available field.
3. Add it to the internal canonical schema.
4. Record its source.
5. Add a test fixture.
6. Implement the deterministic rule.
7. Document the methodology.
8. Only then expose it to the AI report layer.

Do not invent Navamsha response fields.

Do not assume undocumented endpoints.

Do not fabricate astrology calculations.

If an advanced factor cannot currently be calculated reliably from available Navamsha data, mark it:

```text
status = "insufficient_data"
```

and continue rather than inventing a value.

The system must remain modular so that additional astrology endpoints can be added later without changing the public API.

---

# 127. Final Product Philosophy

The service is:

```text
Astrology calculation
        +
Deterministic matchmaking methodology
        +
AI explanation
```

It is NOT:

```text
LLM pretending to calculate astrology.
```

The goal is to build a robust, explainable, testable, replaceable and independently deployable matchmaking engine.

The external website should eventually treat `/ai/` as a black-box service:

```text
INPUT
  ↓
MATCHMAKING API
  ↓
STRUCTURED OUTPUT
```

Everything else remains internal.
