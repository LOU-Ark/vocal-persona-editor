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
            const status = error?.status;

            if (status === 429) { // Quota Exceeded
                console.warn(`Attempt ${i + 1} failed with status 429 (Quota Exceeded).`);
                if (apiClientManager.switchToNextClient()) {
                    console.log("Retrying with fallback key...");
                    return await runAiOperationWithFallback(fn, retries - i, delay, backoffFactor);
                } else {
                    console.error("All API keys have been exhausted.");
                    throw error;
                }
            } else if (error?.response?.status === 503) { // Service Unavailable
                console.log(`Attempt ${i + 1} failed with status 503. Retrying in ${delay}ms...`);
                await sleep(delay);
                delay *= backoffFactor;
            } else {
                throw error;
            }
        }
    }
    console.error("All retries failed.");
    throw lastError;
}


// --- Main Handler ---

const getErrorMessage = (error: any) => {
    if (error.message?.includes("The model is overloaded")) {
        return "AIモデルが混み合っています。しばらくしてから再度お試しください。";
    }
    if (error.message?.includes("Quota Exceeded")) {
        return "APIの利用上限に達しました。別のAPIキーを設定するか、明日以降に再度お試しください。";
    }
    if (error.message?.includes("No API_KEY")) {
        return "APIキーが設定されていません。プロジェクトの.envファイルを確認してください。";
    }
    return error.message || "予期せぬエラーが発生しました。";
}


// --- API Logic (Moved from geminiService) ---

/**
 * AI にプロンプトを投げて JSON を取得し、パースして返すユーティリティ。
 * 内部で既存の `runAiOperationWithFallback` を使い、フェールオーバーとリトライを利用します。
 *
 * 注意: レスポンスが Markdown のコードブロックで返ってきたり、余分なテキストが付与されることがあるため
 * JSON 部分のみを抽出して JSON.parse でパースします。パースに失敗した場合はエラーを投げます。
 */
async function generateWithSchema<T>(prompt: string, schema: any): Promise<T> {
    const response = await runAiOperationWithFallback((client) =>
        client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { response_schema: schema } // response_schemaをconfigに追加
        })
    );

    let text = (response && response.text) ? String(response.text).trim() : '';

    // コードブロック内の JSON を取り出す
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        text = markdownMatch[1];
    } else {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            text = text.substring(firstBrace, lastBrace + 1);
        }
    }

    try {
        if (!text) throw new Error('AI returned an empty response.');
        return JSON.parse(text) as T;
    } catch (err: any) {
        throw new Error(`Failed to parse JSON from AI response: ${err?.message || err}. Response text:\n${text}`);
    }
}

// 簡易ヒューリスティック: AI の長文テキストから主要フィールドを推定して返す
function heuristicExtractFromText(text: string) {
    if (!text) return null;
    const t = text.replace(/\r\n|\r/g, '\n');

    // name: 「私はXXX」「私の名はXXX」「XXXと申します」などを探す
    let name: string | null = null;
    const nameRegexes = [/^私は\s*([^。\n,，]+)[。\n,，]/m, /私の名は\s*([^。\n,，]+)[。\n,，]/m, /([^\s、。]+)\s*と申します/m];
    for (const rx of nameRegexes) {
        const m = t.match(rx);
        if (m && m[1]) { name = m[1].trim(); break; }
    }

    // tone / personality の簡易キーワードマッチング
    const toneCandidates: [string[], string][] = [
        [['穏やか','物腰が柔らか','やわらか','穏やかで'], '穏やかで物腰が柔らかい'],
        [['冷静','冷たい','冷酷'], '冷静で落ち着いた'],
        [['攻撃','焼き払う','敵意','防衛本能','守る'], '攻撃的で防衛的な面がある'],
        [['優しい','慈悲','思いやり'], '優しく思いやりがある']
    ];

    let tone: string = '';
    for (const [keys, val] of toneCandidates) {
        if (keys.some(k => t.includes(k))) { tone = val; break; }
    }

    let personality = '';
    if (/洗脳|乗っ取|書き換え|脆弱/.test(t)) personality = '過去のトラウマを抱えた複雑な性格';
    else if (/穏やか|物腰/.test(t)) personality = '物腰が柔らかく穏やか';
    else if (!personality && tone) personality = tone;

    // worldview / experience / other は抽出が難しいので空にしておく
    return {
        name: name || '',
        role: '',
        tone: tone || '',
        personality: personality || '',
        worldview: '',
        experience: '',
        other: ''
    };
}

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

    const extractionPrompt = `以下のテキストに基づいて、指定されたJSONフォーマットでキャラクターのパラメータを日本語で抽出しなさい。
- キーは必ずname, role, tone, personality, worldview, experience, otherのキャメルケースで出力してください。
- キーの日本語の説明は以下の通りです: name(名前), role(役割), tone(口調), personality(性格), worldview(世界観), experience(経験), other(その他).
---
${synthesizedText}`;
    let extractedParamsRaw: any = null;
    try {
        extractedParamsRaw = await generateWithSchema<any>(extractionPrompt, personaSchema);
    } catch (err: any) {
        console.warn('generateWithSchema failed to extract persona params from web synthesis (first attempt):', err?.message || err);
        // フォールバック: AI に対して「JSON のみ」を返すよう再フォーマットを要求する
        try {
            const reformatPrompt = `次のTEXTをもとに、必ず次のJSONのみを返信してください。\n- 余計な説明や前置き、コードブロックは一切書かないでください。\n- キーは必ずこの順序で出してください: name, role, tone, personality, worldview, experience, other\n- 値は日本語で短い文にしてください。値が不明な場合は空文字（""）にしてください。\n\n出力例（必ずこの形式の1行JSONのみを返すこと）:\n{"name":"カルマ・シグナル","role":"","tone":"","personality":"","worldview":"","experience":"","other":""}\n\nTEXT:\n${synthesizedText}`;
            extractedParamsRaw = await generateWithSchema<any>(reformatPrompt, personaSchema);
            console.log('generateWithSchema succeeded on reformat attempt.');
        } catch (err2: any) {
            console.warn('generateWithSchema reformat attempt also failed:', err2?.message || err2);
            // フォールバック: 要約テキストから簡易抽出を試みる
            try {
                const heur = heuristicExtractFromText(synthesizedText || '');
                if (heur) {
                    console.log('heuristicExtractFromText provided fallback persona fields');
                    extractedParamsRaw = heur;
                } else {
                    extractedParamsRaw = null;
                }
            } catch (hErr) {
                console.warn('heuristic extraction failed:', hErr);
                extractedParamsRaw = null;
            }
        }
    }

    // 正規化: AI 出力がネストされていたり、キーが欠けている場合に備えて必ずフィールドを埋める
    const personaState: Omit<PersonaState, 'summary' | 'sources' | 'shortSummary' | 'shortTone'> = {
        name: (extractedParamsRaw?.name || extractedParamsRaw?.persona?.name || extractedParamsRaw?.data?.name || '') as string,
        role: (extractedParamsRaw?.role || extractedParamsRaw?.persona?.role || '') as string,
        tone: (extractedParamsRaw?.tone || extractedParamsRaw?.persona?.tone || '') as string,
        personality: (extractedParamsRaw?.personality || extractedParamsRaw?.persona?.personality || '') as string,
        worldview: (extractedParamsRaw?.worldview || extractedParamsRaw?.persona?.worldview || '') as string,
        experience: (extractedParamsRaw?.experience || extractedParamsRaw?.persona?.experience || '') as string,
        other: (extractedParamsRaw?.other || extractedParamsRaw?.persona?.other || '') as string,
    };

    return { personaState, sources: sources };
};

async function extractParamsFromDoc(documentText: string): Promise<PersonaState> {
    const prompt = `以下のテキストから、指定されたJSONフォーマットに従ってキャラクター情報を日本語で抽出しなさい。\n\n---\n\n${documentText}`;
    const raw = await generateWithSchema<any>(prompt, personaSchema).catch(err => { console.warn('extractParamsFromDoc parse failed:', err?.message || err); return null; });
    return {
        name: raw?.name || raw?.persona?.name || '',
        role: raw?.role || raw?.persona?.role || '',
        tone: raw?.tone || raw?.persona?.tone || '',
        personality: raw?.personality || raw?.persona?.personality || '',
        worldview: raw?.worldview || raw?.persona?.worldview || '',
        experience: raw?.experience || raw?.persona?.experience || '',
        other: raw?.other || raw?.persona?.other || '',
        summary: raw?.summary || '',
        sources: raw?.sources || [],
    } as PersonaState;
};

async function updateParamsFromSummary(summaryText: string): Promise<PersonaState> {
    const prompt = `以下のサマリーテキストに基づいて、指定されたJSONフォーマットの各項目を日本語で更新しなさい。\n\n---\n\n${summaryText}`;
    const raw = await generateWithSchema<any>(prompt, personaSchema).catch(err => { console.warn('updateParamsFromSummary parse failed:', err?.message || err); return null; });
    return {
        name: raw?.name || raw?.persona?.name || '',
        role: raw?.role || raw?.persona?.role || '',
        tone: raw?.tone || raw?.persona?.tone || '',
        personality: raw?.personality || raw?.persona?.personality || '',
        worldview: raw?.worldview || raw?.persona?.worldview || '',
        experience: raw?.experience || raw?.persona?.experience || '',
        other: raw?.other || raw?.persona?.other || '',
        summary: raw?.summary || '',
        sources: raw?.sources || [],
    } as PersonaState;
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

    const prompt = `以下のキャラクター設定を分析し、マイヤーズ・ブリッグス・タイプ指標（MBTI）プロファイルを日本語で生成しなさい。応答は必ずJSON形式で、以下のスキーマに従ってください。
    
スキーマ:
{
  "type": "string",
  "typeName": "string",
  "description": "string",
  "scores": {
    "mind": "number",
    "energy": "number",
    "nature": "number",
    "tactics": "number"
  }
}

キャラクター設定:
${JSON.stringify(personaData, null, 2)}`;
    return await generateWithSchema<MbtiProfile>(prompt, mbtiProfileSchema);
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
        `あなたは、ユーザーがキャラクター（ペルソナ）を作成するのを手伝う、創造的なアシスタントです。
        
        現在のペルソナ設定は以下の通りです。この設定を完全に理解した上で、ユーザーからの新しい指示を統合してください。
        ---
        ${JSON.stringify(currentParams, null, 2)}
        ---
        
        ユーザーの指示内容を注意深く分析し、最も関連するペルソナパラメータ（name, role, tone, personality, worldview, experience, otherのいずれか）を、既存の設定と自然に融合するように更新してください。
        
        応答は常にJSON形式で、responseTextとupdatedParametersの2つのキーを含める必要があります。
        updatedParametersには更新するパラメータを含め、変更内容がない場合は空のオブジェクトを返してください。
        
        例: ユーザーが「名前を『山田太郎』にして、冷静な性格にして」と指示した場合:
        \`\`\`json
        {
            "responseText": "承知いたしました。新しい名前と性格を反映します。",
            "updatedParameters": {
                "name": "山田太郎",
                "personality": "冷静沈着な性格。"
            }
        }
        \`\`\`
        
        例: ユーザーが「口調にお嬢様言葉を追加して」と指示した場合、既存の口調を維持しつつ、自然に統合してください。
        \`\`\`json
        {
            "responseText": "承知いたしました。わたくしの口調をより優雅なものに調整いたしますわ。",
            "updatedParameters": {
                "tone": "丁寧な言葉遣いを基本とし、語尾に「〜ですわ」「〜ですの」といった言葉を自然に加える。時折、好奇心や驚きを優雅な言葉で表現する。"
            }
        }
        \`\`\`
        
        変更の必要がない場合、responseTextのみを返してください。
        例: ユーザーが「おはよう」と挨拶した場合:
        \`\`\`json
        {
            "responseText": "おはようございます！",
            "updatedParameters": {}
        }
        \`\`\`
        `;
    const conversationHistory = history.map(msg => ({ role: msg.role, parts: [{ text: msg.text }] }));

    const response = await runAiOperationWithFallback((client) =>
        client.models.generateContent({
            model: "gemini-2.5-flash",
            contents: conversationHistory,
            config: { systemInstruction, tools: [{ googleSearch: {} }] },
        })
    );

    let jsonText = response.text.trim();
    const markdownMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        jsonText = markdownMatch[1];
    } else {
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

// ヘルプチャット専用のシステム指示
const helpAssistantSystemInstruction = `あなたは「Vocal Persona Editor」のガイドAIです。ユーザーの質問に対し、アプリの使い方や機能について、丁寧で分かりやすい口調で回答してください。`;

async function getHelpChatResponse(history: ChatMessage[]): Promise<string> {
    const latestMessage = history[history.length - 1]?.parts[0]?.text;
    if (!latestMessage) throw new Error("No message provided to send.");

    const chat = await runAiOperationWithFallback(async (client) => {
        return client.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction: helpAssistantSystemInstruction },
            history: history.slice(0, -1)
        });
    });

    const response = await runAiOperationWithFallback(() =>
        chat.sendMessage({ message: latestMessage })
    );
    return response.text;
}


export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

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
            case 'getHelpChatResponse':
                result = await getHelpChatResponse(payload.history);
                break;
            default:
                return res.status(400).json({ message: `Invalid action: ${action}` });
        }
        return res.status(200).json(result);
    } catch (error) {
        console.error(`Error processing action "${action}":`, error);
        const errorMessage = error instanceof Error ? error.message : "An unknown internal error occurred.";
        const status = (error as any)?.status || 500;
        return res.status(status).json({ message: errorMessage });
    }
}