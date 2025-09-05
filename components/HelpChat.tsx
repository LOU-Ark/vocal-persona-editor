import React, { useState, useEffect, useRef } from 'react';
import { PersonaState, ChatMessage } from '../types';
import * as geminiService from '../services/geminiService';
import { SendIcon, CloseIcon } from './icons';

interface HelpChatProps {
    onClose: () => void;
    persona: PersonaState;
}

export const HelpChat: React.FC<HelpChatProps> = ({ onClose, persona }) => {
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatBoxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setChatHistory([{ role: 'model', parts: [{ text: persona.summary }] }]);
    }, [persona.summary]);

    useEffect(() => {
        if (chatBoxRef.current) {
            chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const handleSendMessage = async () => {
        const messageText = userInput.trim();
        if (!messageText || isLoading) return;

        const newUserMessage: ChatMessage = { role: 'user', parts: [{ text: messageText }] };
        const newHistory = [...chatHistory, newUserMessage];
        setChatHistory(newHistory);
        setUserInput('');
        setIsLoading(true);

        try {
            const responseText = await geminiService.getHelpChatResponse(newHistory);
            const modelMessage: ChatMessage = { role: 'model', parts: [{ text: responseText }] };
            setChatHistory(prev => [...prev, modelMessage]);
        } catch (error) {
            const errorMessage: ChatMessage = { role: 'model', parts: [{ text: "申し訳ありません、エラーが発生しました。" }] };
            setChatHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-24 right-6 z-50">
            <div className="bg-gray-800 rounded-lg shadow-2xl w-[400px] h-[60vh] flex flex-col relative">
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">使い方ガイド</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon/></button>
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
                                {'G'}
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
                <div className="flex-shrink-0 p-4 border-t border-gray-700 flex items-center gap-2">
                    <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="質問を入力..." className="w-full bg-gray-700/80 rounded-md p-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={isLoading} />
                    <button onClick={handleSendMessage} disabled={isLoading || !userInput.trim()} className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 disabled:cursor-not-allowed transition-colors rounded-md shadow-lg flex items-center justify-center"><SendIcon /></button>
                </div>
            </div>
        </div>
    );
};
