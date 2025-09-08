import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Persona, PersonaState, PersonaHistoryEntry, Voice, ChatMessage } from './types';
import { PersonaEditorScreen, CreatePersonaScreen } from './components/PersonaEditorModal';
import { PersonaList } from './components/PersonaList';
import { ProductionChat } from './components/ProductionChat';
import { BackIcon, ChatBubbleIcon } from './components/icons';
import * as geminiService from './services/geminiService';
import { VoiceManagerModal } from './components/VoiceManagerModal';
import { Loader } from './components/Loader';
import { HelpChat } from './components/HelpChat';
import { IssueReporter } from './components/IssueReporter'; // Import the new component

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
  const [activeView, setActiveView] = useState<'list' | 'editor' | 'chat' | 'create'>('list');
  
  const [isVoiceManagerOpen, setIsVoiceManagerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isHelpChatOpen, setIsHelpChatOpen] = useState(false);
  const [isIssueReporterOpen, setIsIssueReporterOpen] = useState(false);
  const [selectedHelpPersonaId, setSelectedHelpPersonaId] = useState<string | null>(null);
  const [helpChatHistory, setHelpChatHistory] = useState<ChatMessage[]>([]);
  const [isHelpChatLoading, setIsHelpChatLoading] = useState(false);

  // --- EFFECTS ---

  useEffect(() => {
    try {
      localStorage.setItem('interactivePersonas', JSON.stringify(personas));
    } catch (error) {
      console.error("Failed to save personas to localStorage:", error);
    }
  }, [personas]);

  useEffect(() => {
    try {
      localStorage.setItem('customVoices', JSON.stringify(customVoices));
    } catch (error) {
      console.error("Failed to save custom voices to localStorage:", error);
    }
  }, [customVoices]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          if (config.defaultVoiceId) {
            setDefaultVoice({
              id: 'default_voice',
              name: config.defaultVoiceName || 'ADA (default)',
              token: '',
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

  useEffect(() => {
    if (personas.length > 0 && selectedHelpPersonaId === null) {
      setSelectedHelpPersonaId(personas[0].id);
    }
  }, [personas, selectedHelpPersonaId]);

  const helpChatPersona = useMemo(() => {
    return personas.find(p => p.id === selectedHelpPersonaId) || personas[0];
  }, [personas, selectedHelpPersonaId]);

  useEffect(() => {
    const fetchWelcomeMessage = async () => {
        if (!helpChatPersona) return;
        setIsHelpChatLoading(true);
        try {
            const welcomeMessage = await geminiService.generateUsageGuideWelcomeMessage(helpChatPersona);
            setHelpChatHistory([{ role: 'model', parts: [{ text: welcomeMessage }] }]);
        } catch (error) {
            console.error("Failed to generate welcome message:", error);
            setHelpChatHistory([{ role: 'model', parts: [{ text: "ようこそ！何かお手伝いできることはありますか？" }] }]);
        } finally {
            setIsHelpChatLoading(false);
        }
    };

    if (isHelpChatOpen && helpChatHistory.length === 0) {
        fetchWelcomeMessage();
    }
  }, [isHelpChatOpen, helpChatPersona]);

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

  const handleOpenCreateScreen = useCallback(() => {
    setActiveView('create');
  }, []);

  const handleBackToList = useCallback(() => {
    setActiveView('list');
    setEditingPersona(null);
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

  const handleSendHelpMessage = useCallback(async (message: string) => {
    if (!helpChatPersona) return;

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
    const newHistory = [...helpChatHistory, newUserMessage];
    setHelpChatHistory(newHistory);
    setIsHelpChatLoading(true);

    try {
        const responseText = await geminiService.getHelpChatResponse(newHistory, helpChatPersona);
        const modelMessage: ChatMessage = { role: 'model', parts: [{ text: responseText }] };
        setHelpChatHistory(prev => [...prev, modelMessage]);
    } catch (error) {
        const errorMessage: ChatMessage = { role: 'model', parts: [{ text: "申し訳ありません、エラーが発生しました。" }] };
        setHelpChatHistory(prev => [...prev, errorMessage]);
    } finally {
        setIsHelpChatLoading(false);
    }
  }, [helpChatHistory, helpChatPersona]);

  const handleSelectHelpPersona = useCallback((id: string) => {
    setSelectedHelpPersonaId(id);
    setHelpChatHistory([]); // Reset history when persona changes
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      {isLoading && <Loader message={loadingMessage} />}
      <div className={`container mx-auto px-4 pb-8 ${activeView === 'editor' ? 'pt-0' : 'pt-8'} ${activeView === 'chat' ? 'flex flex-col h-screen max-h-screen' : ''}`}>
        <header className="flex-shrink-0 sticky top-0 z-20 bg-gray-900/95 backdrop-blur-sm"> {/* ★この行を修正 */}
          <div className="flex justify-between items-center mb-6">
            {activeView === 'list' ? (
              <div className="flex-grow text-center md:text-left">
                <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
                  Interactive Persona Editor
                </h1>
                <p className="text-gray-400 mt-1">AI-powered character creation studio.</p>
                <p className="text-gray-400 mt-1">ペルソナカードをタップして会話を始めましょう！</p>
              </div>
            ) : activeView === 'chat' ? (
              <div className="flex items-center gap-4">
                <button onClick={handleBackToList} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Back to persona list">
                  <BackIcon />
                </button>
                <div> {/* 新しいdivでh1とpをまとめる */}
                  <h1 
                    className="text-2xl font-bold text-white cursor-pointer hover:text-indigo-400 transition-colors"
                    onClick={() => editingPersona && handleOpenEditor(editingPersona)}
                  >
                    {activePersonaForHeader?.name || 'Chat'}
                  </h1>
                  {/* ここに新しいpタグを追加 */}
                  <p className="text-sm text-gray-400 mt-1">名前をタップするとペルソナを編集できます。</p>
                </div>
              </div>
            ) : activeView === 'editor' ? ( // ★このブロックを置き換えます
              <div className="flex items-start gap-4 flex-col sm:flex-row">
                <div className="flex items-center gap-4">
                  <button onClick={handleBackToList} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Back to persona list">
                    <BackIcon />
                  </button>
                  <div className="flex flex-col">
                    <h1 
                      className="text-2xl font-bold text-white cursor-pointer hover:text-indigo-400 transition-colors"
                      onClick={() => editingPersona && handleStartChat(editingPersona.id)}
                    >
                      {activePersonaForHeader?.name || 'Editor'}
                    </h1>
                    <p className="text-sm text-gray-400">名前をタップするとメインチャットを開始できます</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <main className={`${activeView === 'chat' ? 'flex-grow overflow-hidden' : ''}`}>
          {activeView === 'list' && (
            <PersonaList
              personas={personas}
              onEdit={handleOpenEditor}
              onDelete={handleDeletePersona}
              onChat={handleStartChat}
              onCreate={handleOpenCreateScreen}
              onExport={handleExportSinglePersona}
            />
          )}
          {activeView === 'create' && (
            <CreatePersonaScreen
              onBack={handleBackToList}
              onSave={handleSavePersona}
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

      
      {isVoiceManagerOpen && (
        <VoiceManagerModal
          isOpen={isVoiceManagerOpen}
          onClose={handleCloseVoiceManager}
          initialVoices={customVoices}
          onSave={handleSaveVoices}
          defaultVoice={defaultVoice}
        />
      )}
      {isHelpChatOpen && helpChatPersona &&
        <HelpChat 
          onClose={() => setIsHelpChatOpen(false)} 
          persona={helpChatPersona}
          allPersonas={personas}
          selectedPersonaId={selectedHelpPersonaId}
          onSelectPersona={handleSelectHelpPersona}
          onReportIssueClick={() => {
            setIsHelpChatOpen(false);
            setIsIssueReporterOpen(true);
          }}
          chatHistory={helpChatHistory}
          isLoading={isHelpChatLoading}
          onSendMessage={handleSendHelpMessage}
        />
      }
      {isIssueReporterOpen && 
        <IssueReporter 
          isOpen={isIssueReporterOpen} 
          onClose={() => setIsIssueReporterOpen(false)} 
        />
      }
      <div className="fixed bottom-6 right-6 z-60">
        <button onClick={() => setIsHelpChatOpen(true)} className="p-3 bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-full shadow-lg flex items-center justify-center">
          <ChatBubbleIcon />
        </button>
      </div>
    </div>
  );
};

export default App;