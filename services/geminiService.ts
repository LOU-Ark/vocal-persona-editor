
import type { Persona, PersonaState, ChatMessage, WebSource, PersonaCreationChatMessage, PersonaCreationChatResponse, MbtiProfile } from '../types';

async function callApi<T>(action: string, payload: any): Promise<T> {
  try {
    const response = await fetch('/api/gemini', {
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

export const continuePersonaCreationChat = (history: PersonaCreationChatMessage[], currentParams: Partial<PersonaState>): Promise<PersonaCreationChatResponse> => {
  return callApi('continuePersonaCreationChat', { history, currentParams });
};

export const translateNameToRomaji = (name: string): Promise<string> => {
  return callApi('translateNameToRomaji', { name });
};

export const getPersonaChatResponse = (personaState: PersonaState, history: ChatMessage[]): Promise<string> => {
  return callApi('getPersonaChatResponse', { personaState, history });
};