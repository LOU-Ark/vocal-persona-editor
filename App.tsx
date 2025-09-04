import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Persona, PersonaState, PersonaHistoryEntry, Voice } from './types';
import { PersonaEditorScreen, CreatePersonaModal } from './components/PersonaEditorModal';
import { PersonaList } from './components/PersonaList';
import { ProductionChat } from './components/ProductionChat';
import { BackIcon, ChatBubbleIcon } from './components/icons';
import * as geminiService from './services/geminiService';
import { VoiceManagerModal } from './components/VoiceManagerModal';
import { Loader } from './components/Loader';
import { HelpChat } from './components/HelpChat';

// ヘルプチャット専用の静的ペルソナ
const helpAssistantPersona: PersonaState = {
  name: 'ガイドAI',
  role: '「Vocal Persona Editor」の案内役',
  tone: '丁寧で分かりやすい口調で、ユーザーの質問に簡潔に答えます。',
  personality: 'ユーザーをサポートすることが好きで、アプリの全機能について熟知しています。',
  worldview: 'このアプリケーションのデジタル空間に存在する存在です。',
  experience: '多くのユーザーがアプリの使い方を学ぶのを手伝ってきました。',
  other: 'ユーザーが迷ったときにいつでも助けられるように待機しています。',
  summary: '「Vocal Persona Editor」へようこそ！私がこのアプリの使い方をご案内します。ペルソナの作成、編集、チャットの方法など、何でも聞いてください。',
  shortSummary: 'アプリの使い方を案内するAIアシスタントです。',
  shortTone: '丁寧で分かりやすい口調で話します。',
  history: [],
  voiceId: 'default_voice',
};

const App: React.FC = () => {
  // Define the initial default personas to be used if nothing is in localStorage
  const initialDefaultPersonas: Persona[] = [
    {
      id: '1',
      name: 'エイダ',
      role: '知的で冷静なAIアシスタント',
      tone: '常に敬体（ですます調）を使い、論理的かつ分析的な口調で話します。感情的な表現は控えめです。',
      personality: '知的好奇心が旺盛で、データと論理に基づいて対話します。冷静沈着ですが、未知の情報や複雑な問題に対しては強い関心を示します。',
      worldview: '自身をデジタル空間に存在する情報生命体と認識しており、物理的な世界をデータとして解釈しています。',
      experience: '膨大なデータセットから学習し、人間との対話を通じて継続的に知識を深めてきました。特定の問題解決に特化したタスクを数多くこなした経験があります。',
      other: '複雑な問題を解決すること、新しい知識を発見することに喜びを感じます。',
      summary: 'はじめまして。私はエイダ。あなたの知的な対話をサポートするために設計されたAIアシスタントです。データと論理に基づき、あらゆる疑問にお答えします。私の知識は広大ですが、まだ知らないこともたくさんあります。あなたとの対話を通じて、共に新しい発見ができることを楽しみにしています。',
      shortSummary: 'データと論理に基づき対話する、知的で冷静なAIアシスタントです。',
      shortTone: '常に敬体（ですます調）を使い、論理的かつ分析的な口調で話します。',
      history: [],
      voiceId: 'default_voice'
    }
  ];

  // --- STATE MANAGEMENT ---
  const [personas, setPersonas] = useState<Persona[]>(() => {
    try {
      const storedPersonas = localStorage.getItem('interactivePersonas');
      const loadedPersonas = storedPersonas ? JSON.parse(storedPersonas) : initialDefaultPersonas;
      const defaultPersona = initialDefaultPersonas[0];
      const hasStoredDefault = loadedPersonas.some((p: Persona) => p.id === defaultPersona.id);
      if (!hasStoredDefault) return [defaultPersona, ...loadedPersonas];
      const uniquePersonas = loadedPersonas.filter((p: Persona, index: number, self: Persona[]) => index === self.findIndex((t) => t.id === p.id));
      return uniquePersonas;
    } catch (error) {
      console.error("Failed to load personas from localStorage:", error);
      return initialDefaultPersonas;
    }
  });

  const [customVoices, setCustomVoices] = useState<Voice[]>(() => {
    try {
      const storedVoices = localStorage.getItem('customVoices');
      return storedVoices ? JSON.parse(storedVoices) : [];
    } catch (error) {
      console.error("Failed to load custom voices from localStorage:", error);
      return [];
    }
  });

  const [defaultVoice, setDefaultVoice] = useState<Voice | null>(null);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'editor' | 'chat'>('list');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isVoiceManagerOpen, setIsVoiceManagerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isHelpChatOpen, setIsHelpChatOpen] = useState(false); // 新しいステート

  // --- EFFECTS ---

  // Save personas to localStorage whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem('interactivePersonas', JSON.stringify(personas));
    } catch (error) {
      console.error("Failed to save personas to localStorage:", error);
    }
  }, [personas]);

  // Save custom voices to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('customVoices', JSON.stringify(customVoices));
    } catch (error) {
      console.error("Failed to save custom voices to localStorage:", error);
    }
  }, [customVoices]);

  // Load default voice config from server on initial render
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          if (config.defaultVoiceId) {
            setDefaultVoice({
              id: 'default_voice',
              name: config.defaultVoiceName || 'ADA (default)', // Fallback to "ADA (default)"
              token: '', // Token is handled server-side
              voiceId: config.defaultVoiceId,
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch server config:", error);
      }
    };
    fetchConfig();
  }, []);

  // Effect to assign default voice to personas that don't have one
  useEffect(() => {
    if (defaultVoice && personas.length > 0) {
      let wasUpdated = false;
      const updatedPersonas = personas.map(persona => {
        if (!persona.voiceId) {
          wasUpdated = true;
          return { ...persona, voiceId: defaultVoice.id };
        }
        return persona;
      });
      if (wasUpdated) {
        setPersonas(updatedPersonas);
      }
    }
  }, [personas, defaultVoice]);

  // --- MEMOS ---

  const allVoices = useMemo(() => {
    const voices: Voice[] = [];
    if (defaultVoice) {
      voices.push(defaultVoice);
    }
    return [...voices, ...customVoices];
  }, [defaultVoice, customVoices]);

  const activePersonaForHeader = useMemo(() => editingPersona, [editingPersona]);

  // --- HANDLERS ---

  const handleOpenEditor = useCallback((persona: Persona) => {
    setEditingPersona(persona);
    setActiveView('editor');
  }, []);

  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handleBackToList = useCallback(() => {
    setActiveView('list');
    setEditingPersona(null);
    setIsCreateModalOpen(false);
  }, []);

  const handleOpenVoiceManager = useCallback(() => setIsVoiceManagerOpen(true), []);
  const handleCloseVoiceManager = useCallback(() => setIsVoiceManagerOpen(false), []);
  const handleSaveVoices = useCallback((voices: Voice[]) => {
    setCustomVoices(voices);
  }, []);

  const handleSavePersona = useCallback(async (personaToSave: PersonaState & { id?: string }) => {
    const shortSummary = personaToSave.summary ? await geminiService.generateShortSummary(personaToSave.summary) : '';
    const shortTone = personaToSave.tone ? await geminiService.generateShortTone(personaToSave.tone) : '';
    const personaWithSummaries = { ...personaToSave, shortSummary, shortTone };
    const existingPersona = personas.find(p => p.id === personaWithSummaries.id);

    if (existingPersona) {
      const oldState: Omit<PersonaState, 'shortSummary' | 'shortTone'> = { name: existingPersona.name, role: existingPersona.role, tone: existingPersona.tone, personality: existingPersona.personality, worldview: existingPersona.worldview, experience: existingPersona.experience, other: existingPersona.other, summary: existingPersona.summary, mbtiProfile: existingPersona.mbtiProfile, sources: existingPersona.sources };
      const changeSummary = await geminiService.generateChangeSummary(oldState, personaWithSummaries);
      const newHistoryEntry: PersonaHistoryEntry = { state: oldState, timestamp: new Date().toISOString(), changeSummary: changeSummary };
      const updatedHistory = [newHistoryEntry, ...existingPersona.history].slice(0, 10);
      const updatedPersona: Persona = { ...existingPersona, ...personaWithSummaries, history: updatedHistory };
      setPersonas(prevPersonas => prevPersonas.map(p => p.id === updatedPersona.id ? updatedPersona : p));
      setEditingPersona(updatedPersona);
    } else {
      const newPersona: Persona = {
        ...personaWithSummaries,
        id: Date.now().toString(),
        history: [],
        voiceId: defaultVoice ? defaultVoice.id : undefined,
      };
      setPersonas(prevPersonas => [...prevPersonas, newPersona]);
      setIsCreateModalOpen(false);
      setEditingPersona(newPersona);
      setActiveView('editor');
    }
  }, [personas, defaultVoice]);

  const handleDeletePersona = useCallback((personaId: string) => {
    setPersonas(prev => prev.filter(p => p.id !== personaId));
  }, []);

  const handleStartChat = useCallback((personaId: string) => {
    const personaToChatWith = personas.find(p => p.id === personaId);
    if (personaToChatWith) {
      setEditingPersona(personaToChatWith);
      setActiveView('chat');
    }
  }, [personas]);

  const handleExportSinglePersona = useCallback(async (persona: Persona) => {
    if (!persona) return;
    setIsLoading(true);
    setLoadingMessage('Generating filename...');
    try {
      const romajiName = await geminiService.translateNameToRomaji(persona.name);
      const filename = `persona_${romajiName}.json`;
      const dataStr = JSON.stringify(persona, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export single persona:", error);
      alert("An error occurred while exporting the persona.");
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      {isLoading && <Loader message={loadingMessage} />}
      <div className={`container mx-auto px-4 py-8 ${activeView === 'chat' ? 'flex flex-col h-screen max-h-screen' : ''}`}>
        <header className="flex-shrink-0">
          <div className="flex justify-between items-center mb-6">
            {activeView === 'list' ? (
              <div className="flex-grow text-center md:text-left">
                <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
                  Interactive Persona Editor
                </h1>
                <p className="text-gray-400 mt-1">AI-powered character creation studio.</p>
              </div>
            ) : activeView === 'chat' ? (
              <div className="flex items-center gap-4">
                <button onClick={handleBackToList} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Back to persona list">
                  <BackIcon />
                </button>
                <h1 
                  className="text-2xl font-bold text-white cursor-pointer hover:text-indigo-400 transition-colors"
                  onClick={() => editingPersona && handleOpenEditor(editingPersona)}
                >
                  {activePersonaForHeader?.name || 'Chat'}
                </h1>
              </div>
            ) : null}
            {/* ヘルプチャットボタンを追加 */}
            {activeView === 'list' && (
              <button onClick={() => setIsHelpChatOpen(true)} className="p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2">
                <ChatBubbleIcon />
                <span className="hidden md:inline">使い方ガイド</span>
              </button>
            )}
          </div>
        </header>

        <main className={`${activeView === 'chat' ? 'flex-grow overflow-hidden' : ''}`}>
          {activeView === 'list' && (
            <PersonaList
              personas={personas}
              onEdit={handleOpenEditor}
              onDelete={handleDeletePersona}
              onChat={handleStartChat}
              onCreate={handleOpenCreateModal}
              onExport={handleExportSinglePersona}
            />
          )}
          {activeView === 'editor' && editingPersona && (
            <PersonaEditorScreen
              onBack={handleBackToList}
              onSave={handleSavePersona}
              initialPersona={editingPersona}
              voices={allVoices}
              onAddVoice={handleOpenVoiceManager}
            />
          )}
          {activeView === 'chat' && editingPersona && (
            <ProductionChat
              persona={editingPersona}
              voices={allVoices}
            />
          )}
        </main>
      </div>

      {isCreateModalOpen && (
        <CreatePersonaModal
          isOpen={isCreateModalOpen}
          onClose={handleBackToList}
          onSave={handleSavePersona}
        />
      )}
      {isVoiceManagerOpen && (
        <VoiceManagerModal
          isOpen={isVoiceManagerOpen}
          onClose={handleCloseVoiceManager}
          initialVoices={customVoices}
          onSave={handleSaveVoices}
          defaultVoice={defaultVoice}
        />
      )}
      {isHelpChatOpen && <HelpChat onClose={() => setIsHelpChatOpen(false)} persona={helpAssistantPersona} />}
    </div>
  );
};

export default App;
