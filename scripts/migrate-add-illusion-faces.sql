-- Migration: add illusion-faces to captcha_types
-- Safe to run multiple times (idempotent via IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Does NOT disable or remove any existing data.

-- Step 1: Add is_legacy column to captcha_types (nullable boolean, non-breaking).
-- This documents which types are superseded without disabling them (stats still work).
ALTER TABLE captcha_types
  ADD COLUMN IF NOT EXISTS is_legacy boolean DEFAULT false;

-- Step 2: Insert the new illusion-faces type.
INSERT INTO captcha_types (id, display_name, disabled, is_legacy)
VALUES ('illusion-faces', 'Illusion Faces', false, false)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Mark the old letter-based illusion-diffusion type as legacy.
-- disabled remains false so historical data continues to serve stats / eval.
-- Comment this out if you still want illusion-diffusion challenges to be served
-- in production (it will be shown in the demo alongside illusion-faces).
UPDATE captcha_types
  SET is_legacy = true
  WHERE id = 'illusion-diffusion';

-- Verify results
SELECT id, display_name, disabled, is_legacy
FROM captcha_types
ORDER BY id;
