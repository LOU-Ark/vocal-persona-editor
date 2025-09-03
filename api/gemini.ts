import { GoogleGenAI, Type } from "@google/genai";
import type { PersonaState, ChatMessage, WebSource, PersonaCreationChatMessage, PersonaCreationChatResponse, MbtiProfile } from '../types';

// --- Schemas (Copied from original geminiService) ---

const personaSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "キャラクターの名前 (The character's name)" },
    role: { type: Type.STRING, description: "キャラクターの役割や職業 (The character's role or occupation)" },
    tone: { type: Type.STRING, description: "キャラクターの口調や話し方の特徴 (The character's tone and manner of speaking)" },
    personality: { type: Type.STRING, description: "キャラクターの性格 (The character's personality)" },
    worldview: { type: Type.STRING, description: "キャラクターが生きる世界の背景設定 (The background setting or worldview of the character)" },
    experience: { type: Type.STRING, description: "キャラクターの過去の経験や経歴 (The character's past experiences and background)" },
    other: { type: Type.STRING, description: "その他の自由記述設定 (Other free-form settings or notes)" },
  },
  required: ["name", "role", "tone", "personality", "worldview", "experience"]
};

const mbtiProfileSchema = {
    type: Type.OBJECT,
    properties: {
        type: { type: Type.STRING, description: "The 4-letter MBTI type code (e.g., 'INFJ', 'ESTP')." },
        typeName: { type: Type.STRING, description: "The descriptive name for the MBTI type (e.g., 'Advocate', 'Entrepreneur')." },
        description: { type: Type.STRING, description: "A brief, one-paragraph description of this personality type, written from the perspective of the character in Japanese." },
        scores: {
            type: Type.OBJECT,
            properties: {
                mind: { type: Type.NUMBER, description: "Score from 0 (Introverted) to 100 (Extraverted)." },
                energy: { type: Type.NUMBER, description: "Score from 0 (Sensing) to 100 (Intuitive)." },
                nature: { type: Type.NUMBER, description: "Score from 0 (Thinking) to 100 (Feeling)." },
                tactics: { type: Type.NUMBER, description: "Score from 0 (Judging) to 100 (Perceiving)." },
            },
            required: ["mind", "energy", "nature", "tactics"]
        }
    },
    required: ["type", "typeName", "description", "scores"]
};

// --- API Client Management with Fallback ---

const apiClientManager = {
    clients: [] as GoogleGenAI[],
    activeClientIndex: 0,
    initialized: false,

    initialize() {
        if (this.initialized) return;

        const primaryApiKey = process.env.API_KEY;
        const fallbackApiKey = process.env.GEMINI_API_KEY;

        if (primaryApiKey) {
            this.clients.push(new GoogleGenAI({ apiKey: primaryApiKey }));
        }
        if (fallbackApiKey && fallbackApiKey !== primaryApiKey) {
            this.clients.push(new GoogleGenAI({ apiKey: fallbackApiKey }));
        }
        
        this.initialized = true;
    },

    getActiveClient(): GoogleGenAI {
        if (this.clients.length === 0) {
            throw new Error("Server configuration error: No API_KEY or GEMINI_API_KEY environment variable is set.");
        }
        return this.clients[this.activeClientIndex];
    },

    switchToNextClient(): boolean {
        if (this.activeClientIndex + 1 < this.clients.length) {
            this.activeClientIndex++;
            console.log(`Switched to fallback API key (index ${this.activeClientIndex}).`);
            return true;
        }
        return false;
    }
};


// --- Retry & Fallback Helper ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runAiOperationWithFallback<T>(
    fn: (client: GoogleGenAI) => Promise<T>,
    retries = 3,
    delay = 1000,
    backoffFactor = 2
): Promise<T> {
    let lastError: any;

    for (let i = 0; i < retries; i++) {
        try {
            const client = apiClientManager.getActiveClient();
            return await fn(client);
        } catch (error: any) {
            lastError = error;
            const status = error?.status; // Adjusted to check error.status directly for 429

            if (status === 429) { // Quota Exceeded
                console.warn(`Attempt ${i + 1} failed with status 429 (Quota Exceeded).`);
                if (apiClientManager.switchToNextClient()) {
                    console.log("Retrying with fallback key...");
                    // Immediately retry with the new key, don't increment 'i' or delay
                    return await runAiOperationWithFallback(fn, retries, delay, backoffFactor);
                } else {
                    console.error("All API keys have been exhausted.");
                    throw error; // No more fallback keys
                }
            } else if (error?.response?.status === 503) { // Service Unavailable
                console.log(`Attempt ${i + 1} failed with status 503. Retrying in ${delay}ms...`);
                await sleep(delay);
                delay *= backoffFactor;
            } else {
                // For other errors, rethrow immediately
                throw error;
            }
        }
    }
    console.error("All retries failed.");
    throw lastError;
}


// --- Main Handler ---

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Initialize the API client manager on the first valid request
    apiClientManager.initialize();

    const { action, payload } = req.body;

    try {
        if (apiClientManager.clients.length === 0) {
            const errorMessage = "Server configuration error: No API_KEY or GEMINI_API_KEY environment variable is set.";
            console.error(errorMessage);
            return res.status(500).json({ message: errorMessage });
        }

        let result;
        switch (action) {
            case 'createPersonaFromWeb':
                result = await createPersonaFromWeb(payload.topic);
                break;
            case 'extractParamsFromDoc':
                result = await extractParamsFromDoc(payload.documentText);
                break;
            case 'updateParamsFromSummary':
                result = await updateParamsFromSummary(payload.summaryText);
                break;
            case 'generateSummaryFromParams':
                result = await generateSummaryFromParams(payload.params);
                break;
            case 'generateShortSummary':
                result = await generateShortSummary(payload.fullSummary);
                break;
            case 'generateShortTone':
                result = await generateShortTone(payload.fullTone);
                break;
            case 'generateChangeSummary':
                result = await generateChangeSummary(payload.oldState, payload.newState);
                break;
            case 'generateMbtiProfile':
                result = await generateMbtiProfile(payload.personaState);
                break;
            case 'generateRefinementWelcomeMessage':
                result = await generateRefinementWelcomeMessage(payload.personaState);
                break;
            case 'continuePersonaCreationChat':
                result = await continuePersonaCreationChat(payload.history, payload.currentParams);
                break;
            case 'translateNameToRomaji':
                result = await translateNameToRomaji(payload.name);
                break;
            case 'getPersonaChatResponse':
                result = await getPersonaChatResponse(payload.personaState, payload.history);
                break;
            default:
                return res.status(400).json({ message: `Invalid action: ${action}` });
        }
        return res.status(200).json(result);
    } catch (error) {
        console.error(`Error processing action "${action}":`, error);
        const errorMessage = error instanceof Error ? error.message : "An unknown internal error occurred.";
        return res.status(500).json({ message: errorMessage });
    }
}


// --- Helper Functions (Moved from geminiService) ---

const generateWithSchema = async <T,>(prompt: string, schema: any): Promise<T> => {
    try {
        const response = await runAiOperationWithFallback((client) => 
            client.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                },
            })
        );

        const jsonText = response.text.trim();
        if (!jsonText) throw new Error("AI returned an empty response.");
        return JSON.parse(jsonText) as T;
    } catch (error) {
        console.error("Error during Gemini API call with schema:", error);
        throw new Error("Failed to get a valid structured response from AI.");
    }
}

// --- API Logic (Moved from geminiService) ---

async function createPersonaFromWeb(topic: string): Promise<{ personaState: Omit<PersonaState, 'summary' | 'sources' | 'shortSummary' | 'shortTone'>, sources: WebSource[] }> {
    const searchPrompt = `ウェブで「${topic}」に関する情報を検索してください。その情報を統合し、キャラクタープロファイル作成に適した詳細な説明文を日本語で生成してください。考えられる背景、性格、口調、そして特徴的な経験についての詳細を含めてください。`;

    const searchResponse = await runAiOperationWithFallback((client) =>
        client.models.generateContent({
            model: "gemini-2.5-flash",
            contents: searchPrompt,
            config: { tools: [{ googleSearch: {} }] },
        })
    );

    const synthesizedText = searchResponse.text;
    const groundingChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const sources: WebSource[] = groundingChunks
        .map((chunk: any) => ({
            title: chunk.web?.title || 'Unknown Source',
            uri: chunk.web?.uri || '#',
        })
        )
        .filter((source: WebSource, index: number, self: WebSource[]) =>
            source.uri !== '#' && self.findIndex(s => s.uri === source.uri) === index
        );

    if (!synthesizedText) throw new Error("AI could not find enough information on the topic.");
    
    const extractionPrompt = `以下のテキストに基づいて、指定されたJSONフォーマットでキャラクターのパラメータを日本語で抽出しなさい.\n\n---\n\n${synthesizedText}`;
    const extractedParams = await generateWithSchema<Omit<PersonaState, 'summary' | 'sources' | 'shortSummary' | 'shortTone'>>(extractionPrompt, personaSchema);

    return { personaState: extractedParams, sources: sources };
};

async function extractParamsFromDoc(documentText: string): Promise<PersonaState> {
    const prompt = `以下のテキストから、指定されたJSONフォーマットに従ってキャラクター情報を日本語で抽出しなさい.\n\n---\n\n${documentText}`;
    return generateWithSchema<PersonaState>(prompt, personaSchema);
};

async function updateParamsFromSummary(summaryText: string): Promise<PersonaState> {
    const prompt = `以下のサマリーテキストに基づいて、指定されたJSONフォーマットの各項目を日本語で更新しなさい.\n\n---\n\n${summaryText}`;
    return generateWithSchema<PersonaState>(prompt, personaSchema);
};

async function generateSummaryFromParams(params: PersonaState): Promise<string> {
    const prompt = `以下のJSONデータで定義されたキャラクターについて、そのキャラクターの視点から語られるような、魅力的で物語性のある紹介文を日本語で作成してください。'other'フィールドに補足情報があれば、それも内容に含めてください。文章のみを返してください。\n\n---\n\n${JSON.stringify(params, null, 2)}`;
    const response = await runAiOperationWithFallback((client) => 
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text;
};

async function generateShortSummary(fullSummary: string): Promise<string> {
    if (!fullSummary.trim()) return "";
    const prompt = `以下の文章を日本語で約50字に要約してください。:\n\n---\n\n${fullSummary}`;
    const response = await runAiOperationWithFallback((client) => 
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text.trim();
};

async function generateShortTone(fullTone: string): Promise<string> {
    if (!fullTone.trim()) return "";
    const prompt = `以下の口調に関する説明文を、その特徴を捉えつつ日本語で約50字に要約してください。:\n\n---\n\n${fullTone}`;
    const response = await runAiOperationWithFallback((client) => 
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text.trim();
};

async function generateChangeSummary(oldState: Partial<PersonaState>, newState: Partial<PersonaState>): Promise<string> {
    const prompt = `以下の二つのキャラクター設定JSONを比較し、古いバージョンから新しいバージョンへの変更点を日本語で簡潔に一言で要約してください。\n\n古いバージョン:\n${JSON.stringify(oldState, null, 2)}\n\n新しいバージョン:\n${JSON.stringify(newState, null, 2)}\n\n要約:`;
    const response = await runAiOperationWithFallback((client) => 
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text.trim() || "パラメータが更新されました。";
};

async function generateMbtiProfile(personaState: PersonaState): Promise<MbtiProfile> {
    const personaData = { ...personaState };
    delete personaData.mbtiProfile;
    delete personaData.sources;
    delete personaData.summary;
    delete personaData.shortSummary;
    delete personaData.shortTone;

    const prompt = `以下のキャラクター設定を分析し、マイヤーズ・ブリッグス・タイプ指標（MBTI）プロファイルを日本語で生成してください...\n\nキャラクター設定:\n${JSON.stringify(personaData, null, 2)}`;
    return await generateWithSchema(prompt, mbtiProfileSchema);
};

async function generateRefinementWelcomeMessage(personaState: PersonaState): Promise<string> {
    const prompt = `あなたは以下の設定を持つキャラクターです。
---
${JSON.stringify({ name: personaState.name, role: personaState.role, tone: personaState.tone, personality: personaState.personality }, null, 2)}
---
これから、あなた自身の詳細設定をユーザーが対話形式で調整します。その開始にあたり、ユーザーに機能説明を兼ねた挨拶をしてください...\n挨拶文は簡潔に、全体で80文字以内にまとめてください。`;
    const response = await runAiOperationWithFallback((client) => 
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text;
};

async function continuePersonaCreationChat(history: PersonaCreationChatMessage[], currentParams: Partial<PersonaState>): Promise<PersonaCreationChatResponse> {
  const systemInstruction = 
`あなたは、ユーザーがキャラクター（ペルソナ）を作成するのを手伝う、創造的なアシスタントです...\n`;
  const conversationHistory = history.map(msg => ({ role: msg.role, parts: [{ text: msg.text }] }));

  const response = await runAiOperationWithFallback((client) =>
    client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: conversationHistory,
        config: { systemInstruction, tools: [{ googleSearch: {} }] },
    })
  );

  let jsonText = response.text.trim();
  const markdownMatch = jsonText.match(/```(json)?\\s*([\s\S]*?)\\s*```/);
  if (markdownMatch && markdownMatch[2]) jsonText = markdownMatch[2];
  else {
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    if (!jsonText) throw new Error("AI returned an empty response string.");
    const parsed = JSON.parse(jsonText);
    return { responseText: parsed.responseText || "...", updatedParameters: parsed.updatedParameters || {} };
  } catch (parseError) {
    return { responseText: jsonText, updatedParameters: {} };
  }
};

async function translateNameToRomaji(name: string): Promise<string> {
    const prompt = `Translate the following Japanese name into a single, lowercase, filename-safe romaji string... \n\nName: "${name}"\n\nRomaji:`;
    const response = await runAiOperationWithFallback((client) => 
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
};

async function getPersonaChatResponse(personaState: PersonaState, history: ChatMessage[]): Promise<string> {
    const systemInstruction = `You are a character with the following traits. Respond as this character in Japanese.\n- Name: ${personaState.name}\n- Role: ${personaState.role}\n...`;
    const latestMessage = history[history.length - 1]?.parts[0]?.text;
    if (!latestMessage) throw new Error("No message provided to send.");
    
    const chat = await runAiOperationWithFallback(async (client) => {
        return client.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
            history: history.slice(0, -1)
        });
    });
    
    const response = await runAiOperationWithFallback(() => 
        chat.sendMessage({ message: latestMessage })
    );
    return response.text;
};