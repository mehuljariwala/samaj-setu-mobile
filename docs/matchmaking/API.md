# AI Matchmaking API Reference

Base URL: `http://localhost:8000`

## Authentication

Currently open (no auth required in dev). Production: add `X-API-Key` header.

---

## GET /health

Returns service health.

**Response:**
```json
{ "status": "ok", "service": "AI-Matchmaking", "version": "1.0.0" }
```

---

## POST /api/v1/kundli

Calculate and cache a Kundli for a person.

**Request:**
```json
{
  "birthDetails": {
    "dateOfBirth": "1992-04-15",
    "timeOfBirth": "10:30:00",
    "placeOfBirth": "Mumbai, India",
    "latitude": 19.076,
    "longitude": 72.877,
    "timezone": "Asia/Kolkata",
    "birthTimeAccuracy": "exact"
  },
  "gotra": "Kashyap",
  "options": { "forceRefresh": false }
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "provider": "navamsha",
    "methodology": { "system": "vedic", "ayanamsha": "lahiri" },
    "lagna": { "sign": "Aries", "signIndex": 0 },
    "rashi": { "name": "Taurus", "index": 1, "lord": "Venus" },
    "nakshatra": { "name": "Rohini", "index": 3 },
    "planets": [...],
    "houses": [...]
  }
}
```

**Errors:**
| Code | HTTP | Meaning |
|------|------|---------|
| INVALID_BIRTH_DATA | 400 | Invalid date/time format |
| INVALID_TIMEZONE | 400 | Unknown IANA timezone |
| KUNDLI_CALCULATION_FAILED | 502 | Navamsha API error |
| KUNDLI_PROVIDER_TIMEOUT | 504 | Navamsha timed out |

---

## GET /api/v1/kundli/:id

Retrieve a previously calculated Kundli.

---

## POST /api/v1/match

Match two persons and generate compatibility report.

**Request:**
```json
{
  "personA": {
    "birthDetails": { "dateOfBirth": "1992-04-15", "timeOfBirth": "10:30:00", "placeOfBirth": "Mumbai", "latitude": 19.076, "longitude": 72.877, "timezone": "Asia/Kolkata" },
    "gotra": "Kashyap"
  },
  "personB": {
    "birthDetails": { "dateOfBirth": "1994-08-22", "timeOfBirth": "14:45:00", "placeOfBirth": "Delhi", "latitude": 28.613, "longitude": 77.209, "timezone": "Asia/Kolkata" },
    "gotra": "Bharadwaj"
  },
  "options": {
    "generateAIReport": true,
    "language": "en"
  }
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "matchId": "uuid",
    "scores": {
      "overall": { "score": 72, "category": "good", "confidence": "high" },
      "gunaMilan": { "score": 24, "maximumScore": 36, "percentage": 67 }
    },
    "compatibility": { ... },
    "manglik": { ... },
    "aiReport": {
      "summary": "...",
      "overallInterpretation": "...",
      "favorableFactors": [...],
      "cautionFactors": [...],
      "finalAssessment": "..."
    },
    "metadata": { "algorithmVersion": "1.0.0" }
  }
}
```

---

## GET /api/v1/match/:id

Retrieve a previously computed match by matchId.
