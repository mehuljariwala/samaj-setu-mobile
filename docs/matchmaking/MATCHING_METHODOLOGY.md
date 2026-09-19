# Matching Methodology

**Algorithm Version:** 1.0.0  
**Ayanamsha:** Lahiri  
**System:** Vedic

---

## Overall Score Formula

Overall = Weighted Average of all factors below. Missing data = `insufficient_data`, never forced to zero.

| Factor | Weight | Rule ID |
|--------|--------|---------|
| Guna Milan | 25% | GUNA-MILAN-001 |
| Rashi Compatibility | 10% | RASHI-001 |
| Nakshatra Compatibility | 8% | NAKSHATRA-001 |
| Gana | 5% | GANA-001 |
| Emotional | 10% | EMOTIONAL-001 |
| Communication | 7% | COMMUNICATION-001 |
| Family | 8% | FAMILY-001 |
| Lifestyle | 7% | LIFESTYLE-001 |
| Financial | 5% | FINANCIAL-001 |
| Career | 5% | CAREER-001 |
| Long-term | 10% | LONG-TERM-001 |

---

## Guna Milan (Ashtakoot) — 36 Points Max

| Koota | Max | Weight | Rule |
|-------|-----|--------|------|
| Varna | 1 | Lowest | VARNA-001 |
| Vashya | 2 | | VASHYA-001 |
| Tara | 3 | | TARA-001 |
| Yoni | 4 | | YONI-001 |
| Graha Maitri | 5 | | GRAHA-MAITRI-001 |
| Gana | 6 | | GANA-001 |
| Bhakoot | 7 | | BHAKOOT-001 |
| Nadi | 8 | Highest | NADI-001 |

### Nadi Dosha: Same Nadi = 0 points (strong caution). Different = 8 points.
### Gana Dosha: Deva + Rakshasa = 0 points (strong caution).
### Bhakoot Dosha: 6/8, 9/5, 12/2 sign relations = 0 points.

---

## Financial Compatibility — FINANCIAL-001

> **Important:** This is astrological interpretation only. Not professional financial advice. No investment recommendations or guaranteed wealth claims.

- **Inputs:** 2nd house planets, 11th house planets, Jupiter sign, Venus sign
- **Output:** 0–100 score
- **Weight:** 5%

---

## Missing Data Policy

When any input is unavailable:
- Score = `null`
- Status = `insufficient_data`
- Factor is excluded from weighted average (denominator adjusted)
- Evidence includes explanation of what is missing

---

## No Absolute Predictions

Per spec §116-120, the system uses language like:
- "Traditionally favorable"
- "Areas of caution"
- "Potential strengths"
- "Factors worth discussing"

Never: "Marriage guaranteed", "100% compatible", "Never marry this person"
