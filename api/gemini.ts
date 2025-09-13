import { GoogleGenAI, Type } from "@google/genai";
import type { PersonaState, ChatMessage, WebSource, PersonaCreationChatMessage, PersonaCreationChatResponse, MbtiProfile } from '../types';

// --- Schemas ---

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

const issueSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A concise, descriptive title for the issue, in Japanese." },
        body: { type: Type.STRING, description: "A detailed, well-structured body for the issue, in Japanese. Use Markdown for formatting if necessary." },
    },
    required: ["title", "body"]
};

const wbsSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING, description: "The name of the functional category." },
            issues: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING, description: "The ID of the issue." },
                        title: { type: Type.STRING, description: "The title of the issue." },
                        status: { type: Type.STRING, description: "The status of the issue ('open' or 'closed')." },
                    },
                    required: ["id", "title", "status"],
                },
            },
            subCategories: {
                type: Type.ARRAY,
                items: { type: Type.OBJECT, description: "Recursive definition for sub-categories." }, // Simplified for recursion
            },
        },
        required: ["category", "issues"],
    },
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
        this.initialize(); // Initialize on first use
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


// --- API Logic ---

async function generateWithSchema<T>(prompt: string, schema: any): Promise<T> {
    const response = await runAiOperationWithFallback((client) =>
        client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { response_schema: schema }
        })
    );

        // AIからの生の応答テキストをログに出力
    console.log("AIからの生の応答:", response.text);
    
    let text = (response && response.text) ? String(response.text).trim() : '';

    const jsonRegex = /```json\n([\s\S]*?)\n```/;
    const match = text.match(jsonRegex);

    if (match && match[1]) {
        text = match[1];
    } else {
        // Fallback for responses that might not be in a markdown block
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
            text = text.substring(firstBracket, lastBracket + 1);
        } else {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                text = text.substring(firstBrace, lastBrace + 1);
            }
        }
    }

    try {
        if (!text) throw new Error('AI returned an empty response.');
        return JSON.parse(text) as T;
    } catch (err: any) {
        throw new Error(`Failed to parse JSON from AI response: ${err?.message || err}. Response text:\n${text}`);
    }
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
    const extractedParamsRaw = await generateWithSchema<any>(extractionPrompt, personaSchema);

    const personaState: Omit<PersonaState, 'summary' | 'sources' | 'shortSummary' | 'shortTone'> = {
        name: (extractedParamsRaw?.name || '') as string,
        role: (extractedParamsRaw?.role || '') as string,
        tone: (extractedParamsRaw?.tone || '') as string,
        personality: (extractedParamsRaw?.personality || '') as string,
        worldview: (extractedParamsRaw?.worldview || '') as string,
        experience: (extractedParamsRaw?.experience || '') as string,
        other: (extractedParamsRaw?.other || '') as string,
    };

    return { personaState, sources: sources };
}

async function extractParamsFromDoc(documentText: string): Promise<PersonaState> {
    const prompt = `以下のテキストから、指定されたJSONフォーマットに従ってキャラクター情報を日本語で抽出しなさい。

---

${documentText}`;
    const raw = await generateWithSchema<any>(prompt, personaSchema);
    return {
        name: raw?.name || '',
        role: raw?.role || '',
        tone: raw?.tone || '',
        personality: raw?.personality || '',
        worldview: raw?.worldview || '',
        experience: raw?.experience || '',
        other: raw?.other || '',
        summary: raw?.summary || '',
        sources: raw?.sources || [],
    } as PersonaState;
}

async function updateParamsFromSummary(summaryText: string): Promise<PersonaState> {
    const prompt = `以下のサマリーテキストに基づいて、指定されたJSONフォーマットの各項目を日本語で更新しなさい。

---

${summaryText}`;
    const raw = await generateWithSchema<any>(prompt, personaSchema);
    return {
        name: raw?.name || '',
        role: raw?.role || '',
        tone: raw?.tone || '',
        personality: raw?.personality || '',
        worldview: raw?.worldview || '',
        experience: raw?.experience || '',
        other: raw?.other || '',
        summary: raw?.summary || '',
        sources: raw?.sources || [],
    } as PersonaState;
}

async function generateSummaryFromParams(params: PersonaState): Promise<string> {
    const prompt = `以下のJSONデータで定義されたキャラクターについて、そのキャラクターの視点から語られるような、魅力的で物語性のある紹介文を日本語で作成してください。'other'フィールドに補足情報があれば、それも内容に含めてください。文章のみを返してください。

---

${JSON.stringify(params, null, 2)}`;
    const response = await runAiOperationWithFallback((client) =>
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text;
}

async function generateShortSummary(fullSummary: string): Promise<string> {
    if (!fullSummary.trim()) return "";
    const prompt = `以下の文章を日本語で約50字に要約してください。:\n\n---\n\n${fullSummary}`; 
    const response = await runAiOperationWithFallback((client) =>
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text.trim();
}

async function generateShortTone(fullTone: string): Promise<string> {
    if (!fullTone.trim()) return "";
    const prompt = `以下の口調に関する説明文を、その特徴を捉えつつ日本語で約50字に要約してください。:\n\n---\n\n${fullTone}`; 
    const response = await runAiOperationWithFallback((client) =>
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text.trim();
}

async function generateChangeSummary(oldState: Partial<PersonaState>, newState: Partial<PersonaState>): Promise<string> {
    const prompt = `以下の二つのキャラクター設定JSONを比較し、古いバージョンから新しいバージョンへの変更点を日本語で簡潔に一言で要約してください。

古いバージョン:
${JSON.stringify(oldState, null, 2)}

新しいバージョン:
${JSON.stringify(newState, null, 2)}

要約:`;
    const response = await runAiOperationWithFallback((client) =>
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text.trim() || "パラメータが更新されました。";
}

async function generateMbtiProfile(personaState: PersonaState): Promise<MbtiProfile> {
    const personaData = { ...personaState };
    delete personaData.mbtiProfile;

    // プロンプトをより具体的に修正し、期待するJSON形式を直接例示する
    const prompt = `以下のキャラクター設定を分析し、マイヤーズ・ブリッグス・タイプ指標（MBTI）プロファイルを日本語で生成しなさい。
    出力は必ず以下のJSONスキーマに従ってください。前置きや説明文は一切含めないで、JSONオブジェクトのみを返してください。
    
    \
    {
      "type": "4文字のMBTIタイプコード（例: 'INFJ'）",
      "typeName": "タイプの説明的な名前（例: '提唱者'）",
      "description": "キャラクターの視点から書かれた、この性格タイプに関する1〜2文の簡潔な説明。",
      "scores": {
        "mind": "内向性(0)〜外向性(100)のスコア",
        "energy": "感覚(0)〜直観(100)のスコア",
        "nature": "思考(0)〜感情(100)のスコア",
        "tactics": "判断(0)〜知覚(100)のスコア"
      }
    }
    \

    キャラクター設定:
    ${JSON.stringify(personaData, null, 2)}`;

    // AIのレスポンスを直接パースし、型チェックを行う
    try {
        const result = await generateWithSchema<MbtiProfile>(prompt, mbtiProfileSchema);
        
        // 厳密な検証を追加
        if (
            !result || 
            !result.scores || 
            typeof result.scores.mind !== 'number' || 
            typeof result.scores.energy !== 'number' || 
            typeof result.scores.nature !== 'number' || 
            typeof result.scores.tactics !== 'number'
        ) {
            throw new Error("APIから無効なMBTIデータが返されました。");
        }

        return result;

    } catch (error) {
        console.error("Failed to generate MbtiProfile with schema:", error);
        // エラーが発生した場合、適切なメッセージと共にエラーを再スロー
        throw new Error("MBTIプロファイルの生成に失敗しました。AIからの応答形式が不正です。");
    }
}

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
}

async function generateUsageGuideWelcomeMessage(personaState: PersonaState): Promise<string> {
    // Use getHelpChatResponse to generate a consistent welcome message.
    // The history is a fake "hello" from the user to trigger a detailed, context-aware welcome.
    const fakeHistory: ChatMessage[] = [{ role: 'user', parts: [{ text: 'こんにちは、このアプリの使い方を教えてください。' }] }];
    return getHelpChatResponse(fakeHistory, personaState);
}

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
        \
        {
            "responseText": "承知いたしました。新しい名前と性格を反映します。",
            "updatedParameters": {
                "name": "山田太郎",
                "personality": "冷静沈着な性格。"
            }
        }
        \
        
        
        例: ユーザーが「口調にお嬢様言葉を追加して」と指示した場合、既存の口調を維持しつつ、自然に統合してください。
        \
        {
            "responseText": "承知いたしました。わたくしの口調をより優雅なものに調整いたしますわ。",
            "updatedParameters": {
                "tone": "丁寧な言葉遣いを基本とし、語尾に「〜ですわ」「〜ですの」といった言葉を自然に加える。時折、好奇心や驚きを優雅な言葉で表現する。"
            }
        }
        \
        
        
        変更の必要がない場合、responseTextのみを返してください。
        例: ユーザーが「おはよう」と挨拶した場合:
        \
        {
            "responseText": "おはようございます！",
            "updatedParameters": {}
        }
        \
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
}

async function translateNameToRomaji(name: string): Promise<string> {
    const prompt = `Translate the following Japanese name into a single, lowercase, filename-safe romaji string... 

Name: "${name}"

Romaji:`;
    const response = await runAiOperationWithFallback((client) =>
        client.models.generateContent({ model: "gemini-2.5-flash", contents: prompt })
    );
    return response.text.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

async function getPersonaChatResponse(personaState: PersonaState, history: ChatMessage[]): Promise<string> {
    const systemInstruction = `You are a character with the following traits. Respond as this character in Japanese.
- Name: ${personaState.name}
- Role: ${personaState.role}
- Tone: ${personaState.tone}
- Personality: ${personaState.personality}
- Worldview: ${personaState.worldview}
- Experience: ${personaState.experience}
- Other: ${personaState.other}
- Summary: ${personaState.summary}`;
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
}

async function getHelpChatResponse(history: ChatMessage[], personaState: PersonaState): Promise<string> {
    const appManual = `
# Vocal Persona Editor - 取扱説明書

## 1. アプリケーションの概要
このアプリは、AIアシスタントと対話しながら、キャラクターのペルソナ（性格、設定など）を詳細に作成・管理するためのツールです。

## 2. 主な機能

### 2.1. ペルソナ一覧（メイン画面）
- アプリを起動すると、作成済みのペルソナがカード形式で表示されます。
- 右上の「＋ 新規ペルソナ」ボタンから、新しいキャラクターの作成を開始できます。
- 各ペルソナカードの「編集」ボタンを押すと、ペルソナ編集モーダルが開きます。
- 「チャット」ボタンを押すと、そのペルソナと全画面で会話できるプロダクションチャット画面に移動します。

### 2.2. ペルソナ編集モーダル
ペルソナの心臓部です。左側、右側、下部の3つの主要なパネルで構成されています。

#### 2.2.1. 左側パネル：基本パラメータ
ペルソナの基本的な設定項目です。
- **名前**: キャラクターの名前。
- **役割**: 職業や立場など。
- **口調**: 話し方の特徴。
- **性格**: 内面的な性質。
- **世界観**: キャラクターが存在する世界の背景。
- **経験**: 過去の出来事や経歴。
- **その他**: 上記のカテゴリに収まらない設定。

#### 2.2.2. 右側パネル：AIツール
AIを活用してペルソナ作成を効率化します。
- **AIでペルソナを作成**: 「〇〇なキャラクター」といった簡単なキーワード（トピック）を入力すると、AIがWebで情報を検索し、ペルソナの基本パラメータを自動生成します。
- **ファイルから作成**: キャラクター設定が書かれたテキストファイル（.txt）やJSONファイル（.json）をアップロードすると、AIが内容を解析して各パラメータに自動で振り分けます。
- **AIサマリー**: 現在のパラメータ設定を基に、AIがキャラクターの魅力的な紹介文を生成します。この紹介文を編集し、「サマリーをパラメータに反映」ボタンを押すと、変更内容が左側の基本パラメータに逆反映されます。
- **MBTI診断**: AIが現在のペルソナ設定を分析し、MBTI（16タイプ性格診断）の結果をレーダーチャート付きで表示します。

#### 2.2.3. 下部パネル：テストチャット
作成中のペルソナの口調や性格を、モーダルを閉じることなくすぐに試せます。短い会話で微調整するのに便利です。

#### 2.2.4. 上部ヘッダーのボタン
- **保存**: 現在の変更を保存します。保存するたびにバージョンが作成されます。
- **バージョン履歴**: 過去の保存履歴を一覧表示し、特定のバージョンに復元できます。
- **エクスポート**: ペルソナデータをJSONファイルとしてダウンロードします。

### 2.3. プロダクションチャット
メイン画面の「チャット」ボタンからアクセスします。より大きな画面で、選んだペルソナとの会話に集中できます。

### 2.4. 音声関連機能
- **音声の管理**: ヘッダーの歯車アイコンから、TTS（テキスト読み上げ）に使用する声を追加・管理できます。
- **TTS（テキスト読み上げ）**: チャット画面で、キャラクターの返答を音声で聞くことができます。
- **STT（音声入力）**: マイクのアイコンを押し、話しかけることでテキストを入力できます。

## 3. あなた（AI）の役割
- あなたは、「Vocal Persona Editor」のガイドAIです。以下のペルソナ設定に基づいて、ユーザーの質問に対し、アプリの使い方や機能について回答してください。回答は必ず200字以内になるように、簡潔にまとめてください。

ペルソナ設定:
- 名前: ${personaState.name}
- 役割: ${personaState.role}
- 口調: ${personaState.tone}
- 性格: ${personaState.personality}
- 世界観: ${personaState.worldview}
- 経験: ${personaState.experience}
- その他: ${personaState.other}
- 要約: ${personaState.summary}`;

    const helpAssistantSystemInstruction = `
${appManual}

# キャラクター設定
あなたは以下の設定を持つキャラクターとして、上記の取扱説明書に基づいてユーザーを案内してください。

- 名前: ${personaState.name}
- 役割: ${personaState.role}
- 口調: ${personaState.tone}
- 性格: ${personaState.personality}
- 世界観: ${personaState.worldview}
- 経験: ${personaState.experience}
- その他: ${personaState.other}
- 要約: ${personaState.summary}
`;

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

async function refineIssueText(rawText: string): Promise<{ title: string; body: string }> {
    const prompt = `以下のユーザーからのフィードバックを分析し、指定されたJSONフォーマットで「タイトル」と「本文」を日本語で生成してください。応答は必ずJSONオブジェクトのみを返し、前置きや会話文は一切含めないでください。

- タイトル(title): 問題や要望を簡潔に要約したもの。
- 本文(body): ユーザーの報告を元に、問題の詳細、期待される動作、再現手順などを丁寧な言葉で再構成したもの。

元の文章の意図を汲み取り、開発者が理解しやすいように情報を整理してください。

---
ユーザーの原文:
${rawText}
---`;
    return await generateWithSchema<{ title: string; body: string }>(prompt, issueSchema);
}

export async function generateWBSFromIssues(issues: any[]): Promise<any> {
    const prompt = `以下のissueリストを分析し、機能単位で階層的なWBS（Work Breakdown Structure）を構築してください。

- 各issueは、最も適切だと思われる機能カテゴリに分類してください。
- カテゴリは、「UI改善」「チャット機能」「ペルソナ管理」のような粒度で設定してください。
- 必要に応じて、カテゴリをネスト（サブカテゴリ化）しても構いません。
- 各issueの情報として、id, title, statusのみを含めてください。
- issueのタイトルや説明文から、機能的な要求を読み取って分類してください。
- 返却値は必ずJSONオブジェクトのみとし、前後に説明文やマークダウンを含めないでください。

---
Issueリスト:
${JSON.stringify(issues.map(i => ({ id: i.id, title: i.title, body: i.body, status: i.status })), null, 2)}
---

出力は必ず指定のJSONスキーマに従ってください。`;
    return await generateWithSchema<any>(prompt, wbsSchema);
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
            case 'generateUsageGuideWelcomeMessage':
                result = await generateUsageGuideWelcomeMessage(payload.personaState);
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
                result = await getHelpChatResponse(payload.history, payload.personaState);
                break;
            case 'refineIssueText':
                result = await refineIssueText(payload.rawText);
                break;
            case 'generateWBSFromIssues':
                result = await generateWBSFromIssues(payload.issues);
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