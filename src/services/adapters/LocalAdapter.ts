
import { StorageAdapter } from './StorageAdapter';
import { Project, Source, ChatMessage, UserProfile, SourceHistoryItem } from '../../types';
import { idb } from '../../lib/idb';

const USER_KEY = 'molielm_user';
// Basic fallback user
const DEFAULT_USER: UserProfile = {
  id: 'local_u1',
  name: 'Investigador Local',
  email: 'local@molielm.ai',
  role: 'Analista Offline',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Local'
};

export class LocalAdapter implements StorageAdapter {
  getUser(): UserProfile {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_USER;
  }

  async saveUser(user: UserProfile): Promise<void> {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  async verifyVoicePhrase(transcript: string): Promise<{ verified: boolean; username?: string }> {
    // Mock Verification Logic
    const t = transcript.toLowerCase();
    if (t.includes('admin') || t.includes('acceso') || t.includes('neo')) {
        return { verified: true, username: 'Investigador Local' };
    }
    return { verified: false };
  }

  async getProjects(): Promise<Project[]> {
    // Fallback migration from localStorage if IDB is empty could go here
    return idb.getAll<Project>('projects');
  }

  async saveProject(project: Project): Promise<void> {
    await idb.put('projects', project);
  }

  async deleteProject(id: string): Promise<void> {
    await idb.delete('projects', id);
  }

  async addSource(projectId: string, source: Source): Promise<Source> {
    // In Local Adapter, source content (Base64) is stored inside the project object 
    // or we could split it. For simplicity in this refactor, we store it in the Project object
    // but the Adapter interface allows us to optimize this later.
    return source;
  }

  async removeSource(projectId: string, sourceId: string): Promise<void> {
    // No-op for local implementation as sources are inside project JSON
    return;
  }

  async saveChatHistory(projectId: string, history: ChatMessage[]): Promise<void> {
     // Handled via saveProject in local mode
     return;
  }

  async saveSourceHistory(projectId: string, history: SourceHistoryItem[]): Promise<void> {
     // Handled via saveProject in local mode
     return;
  }
}
