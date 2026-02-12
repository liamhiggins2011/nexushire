ALTER TABLE candidates ADD COLUMN IF NOT EXISTS total_yoe REAL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS avg_tenure REAL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS stability_score REAL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS growth_velocity REAL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_open_to_work BOOLEAN;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS company_pedigree JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS tech_stack JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS career_highlights JSONB DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS career_narrative TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS deep_dive_data JSONB;

CREATE INDEX IF NOT EXISTS idx_candidates_total_yoe ON candidates(total_yoe);
CREATE INDEX IF NOT EXISTS idx_candidates_stability ON candidates(stability_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_open_to_work ON candidates(is_open_to_work) WHERE is_open_to_work = true;
