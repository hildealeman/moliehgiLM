import { Project, UserProfile, Source, ChatMessage, SourceHistoryItem } from '../../../types';
import { StorageAdapter } from './adapters/StorageAdapter';
import { LocalAdapter } from './adapters/LocalAdapter';
import { SupabaseAdapter } from './adapters/SupabaseAdapter';

// Helper to safely access env vars
const getEnvVar = (key: string): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || '';
    }
  } catch (e) {
    // Silent fail
  }
  return '';
};

// Factory to select provider
const getAdapter = (): StorageAdapter => {
  const provider = getEnvVar('VITE_DATA_PROVIDER');
  if (provider === 'supabase') {
    return new SupabaseAdapter();
  }
  return new LocalAdapter();
};

const adapter = getAdapter();

export const storageService = {
  // --- AUTH & USER ---
  
  // NOTE: registerUser is legacy/mock only. Cloud mode uses Supabase Auth UI.
  registerUser: async (username: string, pass: string, voicePhrase: string) => {
     // No-op in Cloud mode, or logic to hit Edge Function
     console.log("Register user locally:", username);
  },

  verifyUserVoice: async (transcript: string): Promise<string | null> => {
     const result = await adapter.verifyVoicePhrase(transcript);
     return result.verified ? (result.username || 'User') : null;
  },

  verifyPassword: (username: string, password: string): boolean => {
      // Mock logic kept for fallback
      if (password === 'hgi') return true;
      return false;
  },

  saveSessionUser: async (username: string) => {
      // Fetch profile or create basic one
      const user = adapter.getUser();
      user.name = username;
      await adapter.saveUser(user);
  },
  
  updateUserProfile: async (profile: UserProfile) => {
      await adapter.saveUser(profile);
  },

  getUser: (): UserProfile => {
    return adapter.getUser();
  },

  // --- VOICE ---

  saveVoiceCalibration: async (input: Parameters<StorageAdapter['saveVoiceCalibration']>[0]) => {
    await adapter.saveVoiceCalibration(input);
  },

  // --- PROJECTS ---

  // Changed to Async for Backend Compatibility
  getProjects: async (): Promise<Project[]> => {
    return await adapter.getProjects();
  },

  saveProject: async (project: Project): Promise<void> => {
    await adapter.saveProject(project);
  },

  createProject: (name: string): Project => {
    const newProject: Project = {
      id: crypto.randomUUID(), // Use UUID for DB compatibility
      name: name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sources: [],
      chatHistory: [],
      sourceHistory: []
    };
    // Fire and forget save
    adapter.saveProject(newProject);
    return newProject;
  },

  deleteProject: async (id: string): Promise<Project[]> => {
    await adapter.deleteProject(id);
    return await adapter.getProjects();
  }
};