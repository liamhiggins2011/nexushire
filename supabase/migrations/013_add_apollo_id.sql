ALTER TABLE candidates ADD COLUMN IF NOT EXISTS apollo_id TEXT;
CREATE INDEX IF NOT EXISTS idx_candidates_apollo_id ON candidates(apollo_id);
