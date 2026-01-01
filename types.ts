
export interface Source {
  id: string;
  title: string;
  content: string; // Text content or Base64 string
  type: 'text' | 'file' | 'image';
  mimeType?: string; // e.g., 'application/pdf', 'text/csv'
  extractedText?: string; // Text extracted from binary files for RAG/Live context
  storagePath?: string; // Supabase Storage path when binary content is stored remotely
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
  images?: string[]; // base64
  audioData?: string; // base64 audio for podcasts
  sources?: string[]; // grounded URLs
  evidence?: string[]; // Quotes from RAG
  reasoning?: string; // Step by step logic
}

export enum ModelType {
  FLASH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview',
  IMAGE = 'gemini-3-pro-image-preview',
  LIVE = 'gemini-2.5-flash-native-audio-preview-09-2025',
  TTS = 'gemini-2.5-flash-preview-tts',
  FLASH_LITE = 'gemini-2.5-flash-lite-preview' // Fallback/Fast
}

export interface ImageGenOptions {
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  size: '1K' | '2K' | '4K';
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface SourceHistoryItem {
  id: string;
  timestamp: number;
  type: 'added' | 'removed';
  sourceTitle: string;
  contentType?: string;
  size?: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sources: Source[];
  chatHistory: ChatMessage[];
  sourceHistory: SourceHistoryItem[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  phoneNumber?: string;
  bio?: string;
  role?: string;
}