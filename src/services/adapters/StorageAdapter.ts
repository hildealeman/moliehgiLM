
import { Project, Source, ChatMessage, UserProfile, SourceHistoryItem } from '../../types';

export interface StorageAdapter {
  // User
  getUser(): UserProfile;
  saveUser(user: UserProfile): Promise<void>;
  verifyVoicePhrase(transcript: string): Promise<{ verified: boolean; username?: string }>;

  // Projects
  getProjects(): Promise<Project[]>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Sources (Handling large files)
  addSource(projectId: string, source: Source): Promise<Source>;
  removeSource(projectId: string, sourceId: string): Promise<void>;
  
  // History
  saveChatHistory(projectId: string, history: ChatMessage[]): Promise<void>;
  saveSourceHistory(projectId: string, history: SourceHistoryItem[]): Promise<void>;
}
