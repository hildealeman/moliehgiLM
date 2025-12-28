
# Windsurf Handoff Checklist

Please follow these steps to activate the backend:

1.  **Supabase Setup**:
    *   Create a new Supabase project.
    *   Enable **Google OAuth** in Authentication.
    *   Create a generic email/password user for testing.

2.  **Database**:
    *   Run the SQL in `supabase/migrations/001_init.sql`.

3.  **Storage**:
    *   Create a new Storage Bucket named `molielm-sources`.
    *   Make it **Private**.
    *   Add RLS policy allowing Authenticated users to Upload/Select.

4.  **Edge Functions**:
    *   Set Secret: `GEMINI_API_KEY` in Supabase Dashboard.
    *   Deploy `supabase/functions/gemini-proxy`.
    *   Deploy `supabase/functions/voice-verify`.

5.  **Frontend Config**:
    *   Rename `.env.example` to `.env`.
    *   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
    *   Set `VITE_DATA_PROVIDER=supabase`.
    *   Set `VITE_AI_PROVIDER=gemini_proxy`.

6.  **Verify**:
    *   Run `npm run dev`.
    *   Try logging in via Voice Gate.
    *   Upload a file and check Supabase Storage bucket.
