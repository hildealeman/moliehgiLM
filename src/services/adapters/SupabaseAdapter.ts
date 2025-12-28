
import { StorageAdapter } from './StorageAdapter';
import { Project, Source, ChatMessage, UserProfile, SourceHistoryItem } from '../../types';
import { supabase } from '../../lib/supabase/client';

export class SupabaseAdapter implements StorageAdapter {
  getUser(): UserProfile {
    // In a real app, this would get the Auth context. 
    // For now, return a placeholder or cached user from local storage to not break sync UI.
    const stored = localStorage.getItem('molielm_user');
    return stored ? JSON.parse(stored) : { id: 'guest', name: 'Guest', email: '' };
  }

  async saveUser(user: UserProfile): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      bio: user.bio,
      avatar_url: user.avatarUrl
    });
    if (error) console.error("Supabase Save User Error", error);
  }

  async verifyVoicePhrase(transcript: string): Promise<{ verified: boolean; username?: string }> {
    if (!supabase) return { verified: false };
    
    const { data, error } = await supabase.functions.invoke('voice-verify', {
      body: { transcript }
    });

    if (error || !data?.verified) return { verified: false };
    return { verified: true, username: data.username };
  }

  async getProjects(): Promise<Project[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('projects')
      .select('*, sources(*), messages(*)') // Naive fetch for demo; usually pagination needed
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
        sources: p.sources.map((s: any) => ({
            id: s.id,
            title: s.title,
            content: s.content_preview || "", // Full content might be fetched on demand
            type: s.type,
            mimeType: s.mime_type,
            extractedText: s.extracted_text
        })),
        chatHistory: p.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            isThinking: m.is_thinking,
            evidence: m.evidence,
            reasoning: m.reasoning
        })),
        sourceHistory: [] // To be implemented in DB if needed
    }));
  }

  async saveProject(project: Project): Promise<void> {
    if (!supabase) return;
    
    // Upsert Project
    const { error } = await supabase.from('projects').upsert({
        id: project.id,
        name: project.name,
        updated_at: new Date().toISOString()
    });

    // Note: In Cloud mode, we typically save messages/sources individually, 
    // not the whole blob. This implementation is simplified for the Adapter.
    if (error) console.error("Supabase Save Project Error", error);
  }

  async deleteProject(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('projects').delete().eq('id', id);
  }

  async addSource(projectId: string, source: Source): Promise<Source> {
    if (!supabase) throw new Error("Supabase client not initialized");

    let storagePath = null;
    let contentPreview = source.content.substring(0, 1000); // Store snippets in DB

    // 1. Upload File if binary
    if (source.type !== 'text') {
        const fileExt = source.mimeType?.split('/')[1] || 'bin';
        const fileName = `${projectId}/${Date.now()}_${source.title.replace(/\s/g, '_')}.${fileExt}`;
        
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
    const { data, error } = await supabase.from('sources').insert({
        project_id: projectId,
        title: source.title,
        type: source.type,
        mime_type: source.mimeType,
        storage_path: storagePath,
        content_preview: contentPreview,
        extracted_text: source.extractedText
    }).select().single();

    if (error) throw error;
    
    // Return updated source with remote ID if needed
    return { ...source, id: data.id };
  }

  async removeSource(projectId: string, sourceId: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('sources').delete().eq('id', sourceId);
    // Trigger to delete file from storage would be handled by DB Trigger or separate call
  }

  async saveChatHistory(projectId: string, history: ChatMessage[]): Promise<void> {
    // In a real implementation, we would diff and insert new messages.
    // For this adapter, we assume the calling code saves the Project which saves state.
    // But ideally:
    // await supabase.from('messages').insert(newMessages);
  }

  async saveSourceHistory(projectId: string, history: SourceHistoryItem[]): Promise<void> {
     // Implementation dependent on requirement
  }
}
