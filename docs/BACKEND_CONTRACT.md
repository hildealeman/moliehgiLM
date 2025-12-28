
# Backend Contract

## Overview
MolieLM operates in two modes defined by `VITE_DATA_PROVIDER`:
1.  **Mock:** No backend. Uses IndexedDB.
2.  **Supabase:** Uses Postgres + Storage + Edge Functions.

## Database Schema (Supabase)

### Projects
*   `id`: UUID
*   `user_id`: UUID (FK to auth.users)
*   `name`: Text
*   `sources`: Relation (One-to-Many)

### Sources
*   `id`: UUID
*   `project_id`: UUID
*   `storage_path`: Text (Path in `molielm-sources` bucket)
*   `extracted_text`: Text (Result of OCR/PDF parsing)

## Edge Functions

### `gemini-proxy`
*   **Purpose:** Hides Gemini API Key from client.
*   **Auth:** Requires valid Supabase Auth JWT.
*   **Payload:**
    ```json
    {
      "action": "generateContent",
      "prompt": "Explain string theory",
      "history": ["User: Hi", "Model: Hello"],
      "sources": [{"title": "doc.pdf", "content": "..."}]
    }
    ```
*   **Response:**
    ```json
    { "text": "String theory is..." }
    ```

### `voice-verify`
*   **Purpose:** Verifies security phrase server-side.
*   **Payload:** `{ "transcript": "Soy el Admin" }`
*   **Response:** `{ "verified": true, "username": "Neo" }`
