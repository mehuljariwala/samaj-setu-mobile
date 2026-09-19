# AI Matchmaking Engine

Independent AI-assisted Vedic Kundli matrimonial compatibility engine.

## Architecture

```
EXISTING WEBSITE
     │
     │ HTTP
     ▼
/ai/ SERVICE (this project)
  ├── POST /api/v1/kundli
  └── POST /api/v1/match
     │
  ┌──┴──┬──────────┐
  ▼     ▼          ▼
Postgres  Navamsha  OpenRouter
           │           │
         Kundli      Gemma
           └────┬──────┘
             Match Report
```

## Quick Start

```bash
cd ai
npm install
cp .env.example .env
# Edit .env with your API keys (see below)
npm run dev
```

## API Keys Setup

Edit `ai/.env`:

```env
NAVAMSHA_API_KEY=<your key from navamsha.in/dashboard>
OPENROUTER_API_KEY=<your key from openrouter.ai/keys>
```

The service works **without** a database (in-memory mode) and **without** an OpenRouter key (returns deterministic scores only, no AI report).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health |
| GET | `/health/providers` | Provider configuration status |
| POST | `/api/v1/kundli` | Calculate & cache a Kundli |
| GET | `/api/v1/kundli/:id` | Retrieve a Kundli |
| POST | `/api/v1/match` | Match two persons |
| GET | `/api/v1/match/:id` | Retrieve a match |

See [docs/API.md](./docs/API.md) for full documentation.

## Testing

```bash
npm test                    # Unit tests
```

## Non-Negotiable Rules (from spec)

1. API keys are NEVER exposed to the browser
2. Gemma is NOT the astrology calculator
3. Gemma CANNOT modify deterministic scores
4. Gotra is NEVER inferred from birth data
5. Missing data → `insufficient_data`, never zero
6. No absolute marriage/wealth/medical predictions
