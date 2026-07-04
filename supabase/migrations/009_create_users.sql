-- Create Admin and Test Users
-- Run this in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create admin user (ceo@vistadev.mx)
-- Note: This creates the user in auth.users. The password will be hashed by Supabase.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ceo@vistadev.mx') THEN
    INSERT INTO auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      'ceo@vistadev.mx',
      crypt('Gu@rroMXi977', gen_salt('bf')),
      NOW(),
      '{"role": "admin", "name": "CEO VistaDev"}'::jsonb,
      NOW(),
      NOW()
    );
  END IF;
END $$;

-- Create 10 test users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser1@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser1@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 1"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser2@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser2@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 2"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser3@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser3@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 3"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser4@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser4@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 4"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser5@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser5@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 5"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser6@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser6@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 6"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser7@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser7@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 7"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser8@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser8@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 8"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser9@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser9@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 9"}'::jsonb, NOW(), NOW());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'testuser10@moliehgi.com') THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (gen_random_uuid(), 'testuser10@moliehgi.com', crypt('Test123456!', gen_salt('bf')), NOW(), '{"role": "test", "name": "Test User 10"}'::jsonb, NOW(), NOW());
  END IF;
END $$;

-- Create profiles for the users (if molielm_profiles table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'molielm_profiles') THEN
    INSERT INTO public.molielm_profiles (user_id, name, created_at)
    SELECT 
      id, 
      (raw_user_meta_data->>'name')::text,
      NOW()
    FROM auth.users
    WHERE email IN ('ceo@vistadev.mx', 'testuser1@moliehgi.com', 'testuser2@moliehgi.com', 'testuser3@moliehgi.com', 'testuser4@moliehgi.com', 'testuser5@moliehgi.com', 'testuser6@moliehgi.com', 'testuser7@moliehgi.com', 'testuser8@moliehgi.com', 'testuser9@moliehgi.com', 'testuser10@moliehgi.com')
    ON CONFLICT (user_id) DO UPDATE SET
      name = EXCLUDED.name,
      created_at = NOW();
  END IF;
END $$;
