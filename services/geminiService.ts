import type { Persona, PersonaState, ChatMessage, WebSource, PersonaCreationChatMessage, PersonaCreationChatResponse, MbtiProfile, Issue } from '../types';

interface WBSNode {
  category: string;
  issues: { id: string; title: string; status: 'open' | 'closed' }[];
  subCategories?: WBSNode[];
}

// Check if the code is running in a browser environment
const isBrowser = typeof window !== 'undefined';

const API_BASE_URL = isBrowser
  ? '' // In the browser, use relative paths
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3001'; // On the server, use an absolute path

async function callApi<T>(action: string, payload: any): Promise<T> {
  try {
    const url = `${API_BASE_URL}/api/gemini`;
    // --- Vercel Debugging Log ---
    if (!isBrowser) {
      console.log(`[SERVER-SIDE CALL] Attempting to fetch: ${url}`);
    }
    // --- End Debugging Log ---
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
      throw new Error(errorData.message || `API call failed with status ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`Error in API action '${action}':`, error);
    throw error;
  }
}

export const createPersonaFromWeb = (topic: string): Promise<{ personaState: Omit<PersonaState, 'summary' | 'shortSummary' | 'shortTone'>, sources: WebSource[] }> => {
  return callApi('createPersonaFromWeb', { topic });
};

export const extractParamsFromDoc = (documentText: string): Promise<PersonaState> => {
  return callApi('extractParamsFromDoc', { documentText });
};

export const updateParamsFromSummary = (summaryText: string): Promise<PersonaState> => {
  return callApi('updateParamsFromSummary', { summaryText });
};

export const generateSummaryFromParams = (params: PersonaState): Promise<string> => {
  return callApi('generateSummaryFromParams', { params });
};

export const generateShortSummary = (fullSummary: string): Promise<string> => {
  return callApi('generateShortSummary', { fullSummary });
};

export const generateShortTone = (fullTone: string): Promise<string> => {
  return callApi('generateShortTone', { fullTone });
};

export const generateChangeSummary = (oldState: Partial<PersonaState>, newState: Partial<PersonaState>): Promise<string> => {
  return callApi('generateChangeSummary', { oldState, newState });
};

export const generateMbtiProfile = (personaState: PersonaState): Promise<MbtiProfile> => {
  return callApi('generateMbtiProfile', { personaState });
};

export const generateRefinementWelcomeMessage = (personaState: PersonaState): Promise<string> => {
  return callApi('generateRefinementWelcomeMessage', { personaState });
};

export const generateUsageGuideWelcomeMessage = (personaState: PersonaState): Promise<string> => {
  return callApi('generateUsageGuideWelcomeMessage', { personaState });
};

export const continuePersonaCreationChat = (history: PersonaCreationChatMessage[], currentParams: Partial<PersonaState>): Promise<PersonaCreationChatResponse> => {
  return callApi('continuePersonaCreationChat', { history, currentParams });
};

export const translateNameToRomaji = (name: string): Promise<string> => {
  return callApi('translateNameToRomaji', { name });
};

export const getPersonaChatResponse = (personaState: PersonaState, history: ChatMessage[]): Promise<string> => {
  return callApi('getPersonaChatResponse', { personaState, history });
};

// ヘルプチャット用の新しい関数
export const getHelpChatResponse = (history: ChatMessage[], personaState: PersonaState): Promise<string> => {
  return callApi('getHelpChatResponse', { history, personaState });
};

export const refineIssueText = (rawText: string): Promise<{ title: string; body: string }> => {
  return callApi('refineIssueText', { rawText });
};

export const generateWBSFromIssues = (issues: Issue[]): Promise<WBSNode[]> => {
  return callApi('generateWBSFromIssues', { issues });
};