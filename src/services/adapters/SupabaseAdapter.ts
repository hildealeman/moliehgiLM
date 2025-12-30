
import { StorageAdapter } from './StorageAdapter';
import type { VoiceCalibrationInput } from './StorageAdapter';
import { Project, Source, ChatMessage, UserProfile, SourceHistoryItem } from '../../../types';
import { supabase } from '../../lib/supabase/client';

const TABLES = {
  profiles: 'molielm_profiles',
  projects: 'molielm_projects',
  sources: 'molielm_sources',
  messages: 'molielm_messages',
  voiceCalibrations: 'molielm_voice_calibrations'
} as const;

export class SupabaseAdapter implements StorageAdapter {
  private async getAuthUserId(): Promise<string | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      return data.user?.id || null;
    } catch {
      return null;
    }
  }

  getUser(): UserProfile {
    // In a real app, this would get the Auth context. 
    // For now, return a placeholder or cached user from local storage to not break sync UI.
    const stored = localStorage.getItem('molielm_user');
    return stored ? JSON.parse(stored) : { id: 'guest', name: 'Guest', email: '' };
  }

  async saveUser(user: UserProfile): Promise<void> {
    if (!supabase) return;
    const userId = await this.getAuthUserId();
    if (!userId) return;
    const { error } = await supabase
      .from(TABLES.profiles)
      .upsert(
        {
          user_id: userId,
          name: user.name,
        },
        { onConflict: 'user_id' },
      );
    if (error) console.error("Supabase Save User Error", error);

    // Cache a minimal local profile to keep UI stable
    try {
      const cached: UserProfile = { id: userId, name: user.name || 'User', email: user.email || '' };
      localStorage.setItem('molielm_user', JSON.stringify(cached));
    } catch {}
  }

  async verifyVoicePhrase(transcript: string): Promise<{ verified: boolean; username?: string }> {
    if (!supabase) return { verified: false };
    
    const { data, error } = await supabase.functions.invoke('voice-verify', {
      body: { transcript }
    });

    if (error || !data?.verified) return { verified: false };
    return { verified: true, username: data.username };
  }

  async enrollVoicePhrase(transcript: string, phraseHint?: string | null): Promise<{ ok: boolean }> {
    if (!supabase) return { ok: false };

    const { data, error } = await supabase.functions.invoke('voice-enroll', {
      body: { transcript, phrase_hint: phraseHint ?? null }
    });

    if (error || !data?.ok) return { ok: false };
    return { ok: true };
  }

  async saveVoiceCalibration(input: VoiceCalibrationInput): Promise<void> {
    if (!supabase) return;
    const userId = await this.getAuthUserId();
    if (!userId) throw new Error("Supabase auth required");

    let audioPath: string | null = null;

    if (input.audioDataUrl) {
      const parts = input.audioDataUrl.split(',');
      if (parts.length >= 2) {
        const header = parts[0] || '';
        const mimeMatch = header.match(/data:([^;]+);base64/);
        const mimeType = mimeMatch?.[1] || 'audio/wav';
        const b64 = parts[1];

        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });

        const ext = mimeType.split('/')[1] || 'wav';
        audioPath = `molielm/${userId}/voice_calibrations/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('molielm-sources')
          .upload(audioPath, blob, { contentType: mimeType, upsert: false });

        if (uploadError) throw uploadError;
      }
    }

    const { error } = await supabase.from(TABLES.voiceCalibrations).insert({
      user_id: userId,
      prompt_text: input.promptText,
      transcript: input.transcript,
      audio_path: audioPath,
      duration_ms: input.durationMs,
      sample_rate: input.sampleRate,
      rms: input.rms,
      locale: input.locale,
    });

    if (error) throw error;
  }

  async getProjects(): Promise<Project[]> {
    if (!supabase) return [];
    const userId = await this.getAuthUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from(TABLES.projects)
      .select(`*, ${TABLES.sources}(*), ${TABLES.messages}(*)`) // Naive fetch for demo; usually pagination needed
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
        console.error("Supabase Get Projects Error", error);
        return [];
    }

    // Map DB structure back to Frontend Types
    return data.map((p: any) => ({
        id: p.id,
        name: p.name,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime(),
        sources: (p[TABLES.sources] || []).map((s: any) => ({
            id: s.id,
            title: s.title,
            content: s.content_text || s.content_preview || "",
            type: s.type,
            mimeType: s.mime_type,
            extractedText: s.extracted_text
        })),
        chatHistory: (p[TABLES.messages] || []).map((m: any) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            isThinking: m.is_thinking,
            images: m.images || undefined,
            audioData: m.audio_data || undefined,
            sources: m.sources || undefined,
            evidence: m.evidence || undefined,
            reasoning: m.reasoning || undefined
        })),
        sourceHistory: [] // To be implemented in DB if needed
    }));
  }

  async saveProject(project: Project): Promise<void> {
    if (!supabase) return;
    const userId = await this.getAuthUserId();
    if (!userId) return;
    
    const nowIso = new Date().toISOString();

    // Upsert Project
    const { error } = await supabase.from(TABLES.projects).upsert({
        id: project.id,
        user_id: userId,
        name: project.name,
        updated_at: nowIso
    });

    if (error) console.error("Supabase Save Project Error", error);

    // Upsert Sources
    try {
      const sourcesPayload = (project.sources || []).map((s) => ({
        id: s.id,
        project_id: project.id,
        user_id: userId,
        title: s.title,
        type: s.type,
        mime_type: s.mimeType ?? null,
        storage_path: null,
        content_text: s.type === 'text' ? s.content : null,
        content_preview: (s.content || '').slice(0, 1000),
        extracted_text: s.extractedText ?? null,
      }));
      if (sourcesPayload.length > 0) {
        const { error: sErr } = await supabase.from(TABLES.sources).upsert(sourcesPayload);
        if (sErr) console.error("Supabase Save Sources Error", sErr);
      }
    } catch (e) {
      console.error("Supabase Save Sources Exception", e);
    }

    // Upsert Messages
    try {
      const messagesPayload = (project.chatHistory || []).map((m) => ({
        id: m.id,
        project_id: project.id,
        user_id: userId,
        role: m.role,
        text: m.text,
        is_thinking: m.isThinking ?? null,
        images: m.images ?? null,
        audio_data: m.audioData ?? null,
        sources: m.sources ?? null,
        evidence: m.evidence ?? null,
        reasoning: m.reasoning ?? null,
        created_at: nowIso,
      }));
      if (messagesPayload.length > 0) {
        const { error: mErr } = await supabase.from(TABLES.messages).upsert(messagesPayload);
        if (mErr) console.error("Supabase Save Messages Error", mErr);
      }
    } catch (e) {
      console.error("Supabase Save Messages Exception", e);
    }
  }

  async deleteProject(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from(TABLES.projects).delete().eq('id', id);
  }

  async addSource(projectId: string, source: Source): Promise<Source> {
    if (!supabase) throw new Error("Supabase client not initialized");

    const userId = await this.getAuthUserId();
    if (!userId) throw new Error("Supabase auth required");

    let storagePath = null;
    let contentPreview = source.content.substring(0, 1000);
    const contentText = source.type === 'text' ? source.content : null;

    // 1. Upload File if binary
    if (source.type !== 'text') {
        const fileExt = source.mimeType?.split('/')[1] || 'bin';
        const fileName = `molielm/${userId}/${projectId}/${Date.now()}_${source.title.replace(/\s/g, '_')}.${fileExt}`;
        
        // Convert Base64 to Blob
        const base64Data = source.content.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: source.mimeType });

        const { error: uploadError } = await supabase.storage
            .from('molielm-sources')
            .upload(fileName, blob);

        if (uploadError) throw uploadError;
        storagePath = fileName;
        contentPreview = "[FILE_STORED_IN_BUCKET]";
    }

    // 2. Create DB Record
    const { data, error } = await supabase.from(TABLES.sources).insert({
        id: source.id,
        project_id: projectId,
        user_id: userId,
        title: source.title,
        type: source.type,
        mime_type: source.mimeType,
        storage_path: storagePath,
        content_text: contentText,
        content_preview: contentPreview,
        extracted_text: source.extractedText
    }).select().single();

    if (error) throw error;
    
    // Return updated source with remote ID if needed
    return { ...source, id: data.id || source.id };
  }

  async removeSource(projectId: string, sourceId: string): Promise<void> {
    if (!supabase) return;
    await supabase.from(TABLES.sources).delete().eq('id', sourceId);
    // Trigger to delete file from storage would be handled by DB Trigger or separate call
  }

  async saveChatHistory(projectId: string, history: ChatMessage[]): Promise<void> {
    if (!supabase) return;
    const userId = await this.getAuthUserId();
    if (!userId) return;

    // Replace all messages for project (simple, deterministic)
    try {
      const { error: delErr } = await supabase
        .from(TABLES.messages)
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);
      if (delErr) console.error("Supabase Clear Messages Error", delErr);

      const payload = (history || []).map((m) => ({
        id: m.id,
        project_id: projectId,
        user_id: userId,
        role: m.role,
        text: m.text,
        is_thinking: m.isThinking ?? null,
        images: m.images ?? null,
        audio_data: m.audioData ?? null,
        sources: m.sources ?? null,
        evidence: m.evidence ?? null,
        reasoning: m.reasoning ?? null,
      }));

      if (payload.length > 0) {
        const { error: insErr } = await supabase.from(TABLES.messages).insert(payload);
        if (insErr) console.error("Supabase Insert Messages Error", insErr);
      }
    } catch (e) {
      console.error("Supabase saveChatHistory exception", e);
    }
  }

  async saveSourceHistory(projectId: string, history: SourceHistoryItem[]): Promise<void> {
     // Implementation dependent on requirement
  }
}
