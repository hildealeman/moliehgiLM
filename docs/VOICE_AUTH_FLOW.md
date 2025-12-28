
# Voice Authentication Flow

## Concept
MolieLM uses a "Voice Gate" as a UX feature that precedes standard authentication. It adds a layer of "Sci-Fi" immersion and basic verification.

## Sequence

1.  **Client:**
    *   User holds microphone button.
    *   Browser records audio (WebM/MP4).
    *   Audio sent to `transcribeAudio` (Gemini Flash).

2.  **Verification (Edge Function):**
    *   Transcript text sent to `voice-verify` function.
    *   Function checks transcript against hashed phrases in `voice_identities` table or environment secrets.
    *   Returns `verified: true` if match found.

3.  **Auth (Supabase):**
    *   If verified, Client reveals Login Form.
    *   User enters password (or clicks Google Login).
    *   Supabase returns JWT Session.

## Security Note
This is **NOT** biometric security. It verifies knowledge of a passphrase via voice. 
*   **Risk:** Audio replay attack.
*   **Mitigation:** `voice-verify` logic can enforce timestamp checks or one-time tokens in future iterations.
