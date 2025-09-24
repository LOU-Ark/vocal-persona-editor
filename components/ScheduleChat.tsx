import React, { useState, useEffect, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { BackIcon, SendIcon } from './icons';
import { Persona, ChatMessage } from '../types';
import * as geminiService from '../services/geminiService';

// Extend ChatMessage to include agent information
type ScheduleChatMessage = ChatMessage & { 
  agentId?: string; 
  agentName?: string; 
};

interface ScheduleChatProps {
  onBack: () => void;
  personas: Persona[];
  initialAgentId?: string | null;
}

export const ScheduleChat: React.FC<ScheduleChatProps> = ({ onBack, personas, initialAgentId }) => {
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isChatStarted, setIsChatStarted] = useState(false);
  
  // Chat state
  const [history, setHistory] = useState<ScheduleChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialAgentId) {
      setSelectedAgentIds([initialAgentId]);
    } else {
      setSelectedAgentIds([]);
    }
    setIsChatStarted(false);
    setHistory([]);
  }, [initialAgentId]);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [history]);

  const handleAgentSelect = (personaId: string) => {
    setSelectedAgentIds(prev => {
      if (prev.includes(personaId)) {
        return prev.filter(id => id !== personaId);
      } else {
        if (prev.length < 3) {
          return [...prev, personaId];
        }
        return prev;
      }
    });
  };

  const handleStartChat = () => {
    const initialMessages: ScheduleChatMessage[] = selectedAgents.map(agent => ({
      role: 'model',
      agentId: agent.id,
      agentName: agent.name,
      parts: [{ text: `こんにちは、${agent.name}です。スケジュール調整を始めましょう。` }]
    }));
    setHistory(initialMessages);
    setIsChatStarted(true);
  };

  const handleSendMessage = async () => {
    const messageText = userInput.trim();
    if (!messageText || isLoading) return;

    const newUserMessage: ScheduleChatMessage = { role: 'user', parts: [{ text: messageText }] };
    const newHistory = [...history, newUserMessage];
    setHistory(newHistory);
    setUserInput('');
    setIsLoading(true);

    try {
      const agentResponses = await geminiService.getMultiAgentChatResponse(newHistory, selectedAgents);
      
      const newModelMessages: ScheduleChatMessage[] = agentResponses.map(response => ({
        role: 'model',
        agentId: response.agentId,
        agentName: response.agentName,
        parts: [{ text: response.text }],
      }));

      setHistory(prev => [...prev, ...newModelMessages]);

    } catch (error) {
      const errorMessage: ScheduleChatMessage = {
        role: 'model',
        parts: [{ text: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      };
      setHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAgents = personas.filter(p => selectedAgentIds.includes(p.id));

  const renderAgentSelection = () => (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-foreground mb-4">Select Agents to Plan With</h2>
      <p className="text-muted-foreground mb-6">You can select up to 3 agents to join the scheduling chat.</p>
      
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
        {personas.map(persona => (
          <div 
            key={persona.id}
            onClick={() => handleAgentSelect(persona.id)}
            className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all ${selectedAgentIds.includes(persona.id) ? 'bg-indigo-600/20 ring-2 ring-indigo-500' : 'bg-muted/50 hover:bg-muted'}`}>
            <input
              type="checkbox"
              checked={selectedAgentIds.includes(persona.id)}
              onChange={() => handleAgentSelect(persona.id)}
              className="h-5 w-5 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-700 border-gray-600 cursor-pointer"
              disabled={!selectedAgentIds.includes(persona.id) && selectedAgentIds.length >= 3}
            />
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
              {persona.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-foreground">{persona.name}</p>
              <p className="text-sm text-muted-foreground line-clamp-1">{persona.shortSummary || persona.role}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button 
          onClick={handleStartChat}
          disabled={selectedAgentIds.length === 0}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-md shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed">
          Start Chat with {selectedAgentIds.length} Agent(s)
        </button>
      </div>
    </div>
  );

  const renderChatInterface = () => (
    <div className="h-full flex flex-col">
      <div ref={chatBoxRef} className="flex-grow p-4 overflow-y-auto space-y-4">
        {history.map((msg, index) => (
          <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center font-bold text-sm flex-shrink-0" title={msg.agentName}>
                {msg.agentName?.charAt(0) || 'A'}
              </div>
            )}
            <div className={`max-w-md lg:max-w-xl px-4 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-muted text-foreground'}`}>
              {msg.role === 'model' && <p className="text-xs font-bold text-indigo-400 mb-1">{msg.agentName}</p>}
              <p className="whitespace-pre-wrap">{msg.parts[0].text}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-end gap-2 justify-start">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm flex-shrink-0">...</div>
            <div className="px-4 py-2 rounded-lg bg-muted text-foreground">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-pulse"></span>
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-pulse [animation-delay:0.4s]"></span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 p-4 border-t border-border/50">
        <div className="relative">
          <TextareaAutosize
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            placeholder={`Chat with ${selectedAgents.length} agent(s)...`}
            minRows={1}
            maxRows={6}
            className="w-full resize-none rounded-md bg-muted p-3 pr-20 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !userInput.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 disabled:cursor-not-allowed transition-colors rounded-full shadow-lg flex items-center justify-center"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-4">
            <button onClick={isChatStarted ? () => setIsChatStarted(false) : onBack} className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-colors" aria-label="Back">
              <BackIcon />
            </button>
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 mr-4">
                Schedule Agent
              </h1>
              {isChatStarted && (
                <div className="flex -space-x-2">
                  {selectedAgents.map(agent => (
                      <div key={agent.id} title={agent.name} className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-xs ring-2 ring-background">
                          {agent.name.charAt(0)}
                      </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-grow min-h-0">
        {isChatStarted ? renderChatInterface() : renderAgentSelection()}
      </main>
    </div>
  );
};
