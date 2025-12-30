import { Project, UserProfile } from '../types';

const USER_KEY = 'molielm_user';
const PROJECTS_INDEX_KEY = 'molielm_projects_index';
const PROJECT_PREFIX = 'molielm_project_';
const LEGACY_PROJECTS_KEY = 'molielm_projects'; 
const REGISTERED_USERS_KEY = 'molielm_registered_users';

interface RegisteredUser {
  username: string;
  voicePhrase: string;
  password: string;
}

// Mock initial user
const DEFAULT_USER: UserProfile = {
  id: 'u1',
  name: 'Investigador HGI',
  email: 'usuario@molielm.ai',
  role: 'Senior Analyst',
  phoneNumber: '+52 55 1234 5678',
  bio: 'Especialista en inteligencia fundamentada en humanos y análisis de datos estocásticos.',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
};

export const storageService = {
  // Authentication & Registration
  registerUser: (username: string, password: string, voicePhrase: string) => {
      const users: RegisteredUser[] = JSON.parse(localStorage.getItem(REGISTERED_USERS_KEY) || '[]');
      const others = users.filter(u => u.username !== username);
      others.push({ username, password, voicePhrase });
      localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(others));
  },

  // Returns the username if verified, otherwise null
  verifyUserVoice: (transcript: string): string | null => {
      const t = transcript.toLowerCase().trim();
      
      // Hardcoded fallback for demo
      if (t.includes('admin') || t.includes('operador')) return 'Investigador HGI';
      
      const users: RegisteredUser[] = JSON.parse(localStorage.getItem(REGISTERED_USERS_KEY) || '[]');
      
      // Check against registered users
      // Simple match: if the transcript contains the passphrase or vice-versa (for short phrases)
      for (const u of users) {
          const phrase = u.voicePhrase.toLowerCase();
          if (t.includes(phrase) || (phrase.length > 3 && phrase.includes(t))) {
              return u.username;
          }
      }
      return null;
  },

  verifyPassword: (username: string, password: string): boolean => {
      // Hardcoded fallback
      if (password === 'hgi' && (username === 'Investigador HGI' || !username)) return true;

      const users: RegisteredUser[] = JSON.parse(localStorage.getItem(REGISTERED_USERS_KEY) || '[]');
      const user = users.find(u => u.username === username);
      return user ? user.password === password : false;
  },

  saveSessionUser: (username: string) => {
      const current = storageService.getUser();
      // Keep existing profile data if just logging in
      const updated = {
          ...current,
          name: username,
          // Only update ID if it's a new session for a different user logic, otherwise keep stable
          id: current.name !== username ? crypto.randomUUID() : current.id
      };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
  },
  
  updateUserProfile: (profile: UserProfile) => {
      localStorage.setItem(USER_KEY, JSON.stringify(profile));
  },

  // User Management
  getUser: (): UserProfile => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (!stored) {
        localStorage.setItem(USER_KEY, JSON.stringify(DEFAULT_USER));
        return DEFAULT_USER;
      }
      return JSON.parse(stored);
    } catch (e) {
      console.error("Error accessing user storage", e);
      return DEFAULT_USER;
    }
  },

  // Project Management
  getProjects: (): Project[] => {
    try {
      const storedIndex = localStorage.getItem(PROJECTS_INDEX_KEY);
      
      // 1. New Split Storage System
      if (storedIndex) {
        const index: {id: string}[] = JSON.parse(storedIndex);
        return index.map(meta => {
          const projectData = localStorage.getItem(`${PROJECT_PREFIX}${meta.id}`);
          if (projectData) {
            try {
              return JSON.parse(projectData);
            } catch (e) {
              console.error(`Error parsing project ${meta.id}`, e);
              return null;
            }
          }
          return null; 
        }).filter((p): p is Project => p !== null);
      }

      // 2. Fallback / Migration from Legacy Monolithic Key
      const legacyData = localStorage.getItem(LEGACY_PROJECTS_KEY);
      if (legacyData) {
        try {
          const projects: Project[] = JSON.parse(legacyData);
          // Migrate immediately
          storageService.migrateToSplitStorage(projects);
          return projects;
        } catch (e) {
          console.error("Error migrating legacy data", e);
          return [];
        }
      }

      return [];
    } catch (e) {
      console.error("Error getting projects", e);
      return [];
    }
  },

  migrateToSplitStorage: (projects: Project[]) => {
    try {
      // Create Index
      const index = projects.map(p => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }));
      
      // Save Index
      localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));

      // Save Individual Projects
      projects.forEach(p => {
        localStorage.setItem(`${PROJECT_PREFIX}${p.id}`, JSON.stringify(p));
      });

      // Clear Legacy Key to free space
      localStorage.removeItem(LEGACY_PROJECTS_KEY);
      console.log("Migration to split storage complete.");
    } catch (e) {
      console.error("Migration failed, likely quota exceeded during migration.", e);
    }
  },

  saveProject: (project: Project): void => {
    try {
      // 1. Update Index if needed (check if exists first)
      const storedIndex = localStorage.getItem(PROJECTS_INDEX_KEY);
      let index: {id: string, name: string, createdAt: number, updatedAt: number}[] = storedIndex ? JSON.parse(storedIndex) : [];
      
      const existingEntryIndex = index.findIndex(p => p.id === project.id);
      const meta = {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: Date.now()
      };

      if (existingEntryIndex >= 0) {
        index[existingEntryIndex] = meta;
      } else {
        index.push(meta);
      }
      
      // Save index first (small)
      localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));

      // 2. Save Project Data (large)
      localStorage.setItem(`${PROJECT_PREFIX}${project.id}`, JSON.stringify({
        ...project,
        updatedAt: Date.now()
      }));

    } catch (e: any) {
      console.error("Storage quota exceeded", e);
      // Attempt to clear some space or notify?
      if (e.name === 'QuotaExceededError' || e.code === 22) {
         alert("⚠️ Almacenamiento lleno. No se pudo guardar el proyecto. Intenta borrar fuentes o proyectos antiguos.");
      }
    }
  },

  createProject: (name: string): Project => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sources: [],
      chatHistory: [],
      sourceHistory: []
    };
    storageService.saveProject(newProject);
    return newProject;
  },

  deleteProject: (id: string): Project[] => {
    try {
      // Remove individual data
      localStorage.removeItem(`${PROJECT_PREFIX}${id}`);

      // Update index
      const storedIndex = localStorage.getItem(PROJECTS_INDEX_KEY);
      if (storedIndex) {
        const index = JSON.parse(storedIndex);
        const newIndex = index.filter((p: any) => p.id !== id);
        localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(newIndex));
      }

      return storageService.getProjects();
    } catch (e) {
      console.error("Error deleting project", e);
      return [];
    }
  }
};