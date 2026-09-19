-- AI Matchmaking Engine — PostgreSQL DDL
-- Per spec §60-63

-- Birth profiles
CREATE TABLE IF NOT EXISTS birth_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_user_id TEXT,
  date_of_birth DATE NOT NULL,
  time_of_birth TIME NOT NULL,
  place_of_birth TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timezone TEXT NOT NULL,
  birth_time_accuracy TEXT,
  gotra TEXT,
  birth_data_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_birth_profiles_hash ON birth_profiles (birth_data_hash);
CREATE INDEX IF NOT EXISTS idx_birth_profiles_external_user_id ON birth_profiles (external_user_id);

-- Kundli charts
CREATE TABLE IF NOT EXISTS kundli_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birth_profile_id UUID NOT NULL REFERENCES birth_profiles(id),
  provider TEXT NOT NULL DEFAULT 'navamsha',
  provider_version TEXT,
  methodology TEXT NOT NULL DEFAULT 'vedic',
  ayanamsha TEXT NOT NULL DEFAULT 'lahiri',
  chart_json JSONB NOT NULL,
  raw_provider_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kundli_charts_birth_profile ON kundli_charts (birth_profile_id);

-- Compatibility matches — normalized pair ordering (spec §62)
CREATE TABLE IF NOT EXISTS compatibility_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a_kundli_id UUID NOT NULL REFERENCES kundli_charts(id),
  person_b_kundli_id UUID NOT NULL REFERENCES kundli_charts(id),
  algorithm_version TEXT NOT NULL,
  overall_score INTEGER,
  guna_score INTEGER,
  compatibility_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_pair_order CHECK (person_a_kundli_id < person_b_kundli_id),
  CONSTRAINT uq_match_pair_version UNIQUE (person_a_kundli_id, person_b_kundli_id, algorithm_version)
);

CREATE INDEX IF NOT EXISTS idx_match_pair ON compatibility_matches (person_a_kundli_id, person_b_kundli_id);

-- AI reports — unique per match + language + prompt version + model (spec §63)
CREATE TABLE IF NOT EXISTS ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES compatibility_matches(id),
  provider TEXT NOT NULL DEFAULT 'openrouter',
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  report_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_report_match_lang_version UNIQUE (match_id, language, prompt_version, model)
);
