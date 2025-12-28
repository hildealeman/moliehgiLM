
# MolieLM - HGI (Human Grounded Intelligence)

MolieLM is a localized Spanish clone of NotebookLM, designed to ingest documents, connect ideas, and provide real-time audio debates using Google's Gemini models.

## 🏗 Architecture

MolieLM uses a **Hybrid Adapter Architecture**:

1.  **Mock Mode (Default):**
    *   **Database:** IndexedDB (Browser)
    *   **Storage:** IndexedDB (Files stored as Blobs)
    *   **AI:** Client-side Gemini API calls
    *   *Zero setup required.*

2.  **Cloud Mode (Production):**
    *   **Database:** Supabase Postgres
    *   **Storage:** Supabase Storage (`molielm-sources` bucket)
    *   **AI:** Supabase Edge Function (`gemini-proxy`)
    *   **Auth:** Voice Gate + Supabase Auth

## 🚀 Quick Start (Local Mock Mode)

1.  **Clone & Install**:
    ```bash
    git clone <repo>
    cd molielm
    npm install
    ```
2.  **Run**:
    ```bash
    npm run dev
    ```

## ☁️ Cloud Setup (Supabase)

See [docs/WINDSURF_HANDOFF.md](docs/WINDSURF_HANDOFF.md) for automated setup instructions using an AI IDE.

### Manual Steps
1.  Create a Supabase Project.
2.  Run `supabase/migrations/001_init.sql` in the SQL Editor.
3.  Deploy Edge Functions in `supabase/functions`.
4.  Set Environment Variables in `.env`:
    ```
    VITE_DATA_PROVIDER=supabase
    VITE_AI_PROVIDER=gemini_proxy
    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...
    ```

## 📚 Documentation
*   [Backend Contract](docs/BACKEND_CONTRACT.md)
*   [Gemini Setup](docs/GEMINI_SETUP.md)
*   [Voice Auth Flow](docs/VOICE_AUTH_FLOW.md)
