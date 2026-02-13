ALTER TABLE candidates ADD COLUMN IF NOT EXISTS inferred_intent TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS intent_confidence TEXT;
