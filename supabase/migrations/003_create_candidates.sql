CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  headline TEXT,
  location TEXT,
  current_title TEXT,
  current_company TEXT,
  profile_url TEXT UNIQUE NOT NULL,
  experience JSONB DEFAULT '[]',
  education JSONB DEFAULT '[]',
  skills JSONB DEFAULT '[]',
  email TEXT,
  github_url TEXT,
  twitter_url TEXT,
  fit_score INTEGER,
  fit_reasoning TEXT,
  embedding VECTOR(1536),
  raw_scraped_markdown TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_profile_url ON candidates(profile_url);
CREATE INDEX IF NOT EXISTS idx_candidates_fit_score ON candidates(fit_score DESC);
