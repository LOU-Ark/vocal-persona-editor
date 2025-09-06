// Represents a source found via Google Search
export interface WebSource {
  title: string;
  uri: string;
}

// Represents the MBTI profile of a persona
export interface MbtiProfile {
  type: string; // e.g., "INFJ"
  typeName: string; // e.g., "Advocate"
  description: string;
  scores: {
    mind: number;     // 0 (I) to 100 (E)
    energy: number;   // 0 (S) to 100 (N)
    nature: number;   // 0 (T) to 100 (F)
    tactics: number;  // 0 (J) to 100 (P)
  };
}

// Represents the core editable properties of a persona
export interface PersonaState {
  name: string;
  role: string;
  tone: string;
  personality: string;
  worldview: string;
  experience: string;
  other: string; // New field for other free-form notes
  summary: string;
  shortSummary?: string; // New field for card summary
  shortTone?: string; // New field for card tone summary
  sources?: WebSource[]; // Added for web sources
  mbtiProfile?: MbtiProfile; // Added for MBTI analysis
  voiceId?: string; // ID of the assigned voice model
}

// Represents a single entry in the persona's history
export interface PersonaHistoryEntry {
  state: PersonaState;
  timestamp: string; // ISO string
  changeSummary: string; // AI-generated summary of changes
}

// The main Persona object, including its history
export interface Persona extends PersonaState {
  id: string;
  history: PersonaHistoryEntry[];
}

// Represents a message in the test chat
export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// Represents a custom voice configuration for Fish Audio
export interface Voice {
  id: string;
  name: string;
  token: string;
  voiceId: string;
}

// Represents a message in the persona creation chat
export interface PersonaCreationChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Represents the response from the AI during persona creation chat
export interface PersonaCreationChatResponse {
  responseText: string;
  updatedParameters: Partial<PersonaState>;
}

// Represents a user-submitted issue or feedback
export interface Issue {
  id: string;
  title: string;
  body: string;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
}