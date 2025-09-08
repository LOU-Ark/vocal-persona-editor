import React, { useState, useEffect, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { PersonaState, ChatMessage, Persona } from '../types';
import { SendIcon, CloseIcon } from './icons';
import { FaRegEnvelope } from 'react-icons/fa';

interface HelpChatProps {
    onClose: () => void;
    persona: PersonaState;
    allPersonas: Persona[];
    selectedPersonaId: string | null;
    onSelectPersona: (id: string) => void;
    onReportIssueClick: () => void;
    chatHistory: ChatMessage[];
    isLoading: boolean;
    onSendMessage: (message: string) => void;
}

export const HelpChat: React.FC<HelpChatProps> = ({ 
    onClose, 
    persona, 
    allPersonas, 
    selectedPersonaId, 
    onSelectPersona, 
    onReportIssueClick,
    chatHistory,
    isLoading,
    onSendMessage
}) => {
    const [userInput, setUserInput] = useState('');
    const chatBoxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatBoxRef.current) {
            chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const handleSendMessage = () => {
        const messageText = userInput.trim();
        if (!messageText || isLoading) return;
        onSendMessage(messageText);
        setUserInput('');
    };

    const handlePersonaChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        onSelectPersona(event.target.value);
    };

    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef, onClose]);

    return (
        <div className="fixed bottom-24 right-6 z-50" ref={wrapperRef}>
            <div className="bg-gray-800 rounded-lg shadow-2xl w-[calc(100vw-2rem)] max-w-md h-[60vh] flex flex-col relative">
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">使い方ガイド</h2>
                    <div className="flex items-center">
                        <select
                            value={selectedPersonaId || ''}
                            onChange={handlePersonaChange}
                            className="bg-gray-700 text-white text-sm rounded-md px-2 py-1 mr-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {allPersonas.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                        <button onClick={onReportIssueClick} className="text-gray-400 hover:text-white mr-2 p-2 rounded-full hover:bg-gray-700 transition-colors" title="フィードバックを送信">
                            <FaRegEnvelope />
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition-colors"><CloseIcon/></button>
                    </div>
                </header>
                <div ref={chatBoxRef} className="flex-grow p-4 overflow-y-auto space-y-4">
                    {chatHistory.map((msg, index) => (
                        <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'model' && (
                                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
                                    {persona?.name?.charAt(0) || 'G'}
                                </div>
                            )}
                            <div className={`max-w-md lg:max-w-xl px-4 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                                <p className="whitespace-pre-wrap">{msg.parts[0].text}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-end gap-2 justify-start">
                            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {persona?.name?.charAt(0) || 'G'}
                            </div>
                            <div className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex-shrink-0 p-4 border-t border-gray-700">
                  <TextareaAutosize
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    placeholder="質問を入力..."
                    minRows={1}
                    maxRows={4}
                    className="w-full resize-none rounded-md bg-gray-700/80 p-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={isLoading}
                  />
                  <div className="flex items-center justify-end mt-2">
                    <button onClick={handleSendMessage} disabled={isLoading || !userInput.trim()} className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 disabled:cursor-not-allowed transition-colors rounded-md shadow-lg flex items-center justify-center"><SendIcon /></button>
                  </div>
                </div>
            </div>
        </div>
    );
};