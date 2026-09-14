import type { Kundli } from '../types/kundli.js';
import type { CompatibilityResult } from '../types/compatibility.js';
import type { AIReport } from '../types/aiReport.js';
import { logger } from '../utils/logger.js';

// In-memory store (used when ENABLE_DATABASE=false)
// Per spec §5 — ENABLE_DATABASE toggles between in-memory and Postgres
const kundliStore = new Map<string, Kundli>();
const matchStore = new Map<string, CompatibilityResult>();
const reportStore = new Map<string, AIReport & { matchId: string; language: string; promptVersion: string; model: string }>();

// ---- Kundli Repository ----
export const kundliRepository = {
  async save(kundli: Kundli): Promise<Kundli> {
    kundliStore.set(kundli.id, kundli);
    // Also index by hash for cache lookup
    kundliStore.set(`hash:${kundli.birthDataHash}`, kundli);
    logger.debug('Kundli saved', { id: kundli.id });
    return kundli;
  },

  async findById(id: string): Promise<Kundli | null> {
    return kundliStore.get(id) ?? null;
  },

  async findByHash(hash: string): Promise<Kundli | null> {
    return kundliStore.get(`hash:${hash}`) ?? null;
  },
};

// ---- Match Repository ----
// Normalize pair ordering per spec §62 (smaller ID = person A)
function normalizedPairKey(idA: string, idB: string, version: string): string {
  const [lo, hi] = [idA, idB].sort();
  return `match:${lo}:${hi}:${version}`;
}

export const matchRepository = {
  async save(match: CompatibilityResult): Promise<CompatibilityResult> {
    matchStore.set(match.matchId, match);
    // Also store by pair key for dedup
    // We don't have kundliIds here so matchId is unique enough
    logger.debug('Match saved', { matchId: match.matchId });
    return match;
  },

  async findById(matchId: string): Promise<CompatibilityResult | null> {
    return matchStore.get(matchId) ?? null;
  },

  async findByPair(
    kundliIdA: string,
    kundliIdB: string,
    algorithmVersion: string,
  ): Promise<CompatibilityResult | null> {
    const key = normalizedPairKey(kundliIdA, kundliIdB, algorithmVersion);
    for (const match of matchStore.values()) {
      if (matchStore.get(`pair:${key}`) === match) return match;
    }
    return null;
  },

  async savePairKey(kundliIdA: string, kundliIdB: string, match: CompatibilityResult): Promise<void> {
    const key = normalizedPairKey(kundliIdA, kundliIdB, match.algorithmVersion);
    matchStore.set(`pair:${key}`, match);
  },
};

// ---- Report Repository ----
function reportKey(matchId: string, language: string, promptVersion: string, model: string): string {
  return `report:${matchId}:${language}:${promptVersion}:${model}`;
}

export const reportRepository = {
  async save(
    matchId: string,
    report: AIReport,
    language: string,
    promptVersion: string,
    model: string,
  ): Promise<void> {
    const key = reportKey(matchId, language, promptVersion, model);
    reportStore.set(key, { ...report, matchId, language, promptVersion, model });
    logger.debug('AI report saved', { matchId, language });
  },

  async find(
    matchId: string,
    language: string,
    promptVersion: string,
    model: string,
  ): Promise<AIReport | null> {
    const key = reportKey(matchId, language, promptVersion, model);
    const entry = reportStore.get(key);
    return entry ?? null;
  },
};
