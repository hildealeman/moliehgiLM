create extension if not exists "pgcrypto";

-- Ensure molielm_profiles.id has a UUID default so inserts/upserts that omit id don't fail.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'molielm_profiles'
      AND column_name = 'id'
  ) THEN
    ALTER TABLE public.molielm_profiles
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END $$;
