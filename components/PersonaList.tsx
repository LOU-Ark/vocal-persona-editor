
import React from 'react';
import { Persona } from '../types';
import { EditIcon, TrashIcon, ChatBubbleIcon, PlusIcon, DownloadIcon } from './icons';

interface PersonaListProps {
  personas: Persona[];
  onEdit: (persona: Persona) => void;
  onDelete: (id: string) => void;
  onChat: (id: string) => void;
  onCreate: () => void;
  onExport: (persona: Persona) => void;
}

export const PersonaList: React.FC<PersonaListProps> = ({ personas, onEdit, onDelete, onChat, onCreate, onExport }) => {
  if (personas.length === 0) {
    return (
      <div className="text-center py-16 px-8 bg-gray-800 rounded-lg flex flex-col items-center">
        <h2 className="text-2xl font-semibold text-gray-400">No Personas Yet</h2>
        <p className="text-gray-500 mt-2">Click the button below to create your first character.</p>
        <button 
          onClick={onCreate}
          className="mt-6 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-md shadow-lg"
        >
          <PlusIcon />
          New Persona
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <button 
        onClick={onCreate}
        className="bg-gray-800/50 border-2 border-dashed border-gray-700 rounded-lg shadow-lg p-6 flex flex-col justify-center items-center cursor-pointer transition-all hover:border-indigo-500 hover:bg-gray-700/50 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
        aria-label="Create new persona"
      >
        <PlusIcon />
        <span className="mt-2 font-semibold">New Persona</span>
      </button>
      {personas.map(persona => (
        <div 
          key={persona.id} 
          className="bg-gray-800 rounded-lg shadow-lg p-6 flex flex-col justify-between transition-all transform hover:-translate-y-1 hover:shadow-indigo-500/30 cursor-pointer"
          onClick={() => onChat(persona.id)}
        >
          <div>
            <h3 className="text-xl font-bold text-indigo-400 truncate" title={persona.name}>
              {persona.name}
            </h3>
            <p className="text-sm text-gray-300 mt-2" title={persona.summary}>
              {persona.shortSummary || 
                (persona.summary 
                  ? `${persona.summary.substring(0, 50)}${persona.summary.length > 50 ? '...' : ''}`
                  : <span className="italic text-gray-500">No summary available.</span>
                )
              }
            </p>
            <div className="mt-4 pt-2 border-t border-gray-700/50">
                <span className="text-xs font-semibold text-gray-500 mr-2">口調:</span>
                <span className="text-sm text-indigo-300 italic" title={persona.tone}>
                  {persona.shortTone || 
                    (persona.tone 
                      ? `${persona.tone.substring(0, 50)}${persona.tone.length > 50 ? '...' : ''}`
                      : "未設定"
                    )
                  }
                </span>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={(e) => { e.stopPropagation(); onEdit(persona); }} title="Edit this Persona" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"><EditIcon /></button>
            <button onClick={(e) => { e.stopPropagation(); onExport(persona); }} title="Export this Persona" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"><DownloadIcon /></button>
            <button onClick={(e) => { e.stopPropagation(); persona.id && onDelete(persona.id); }} title="Delete this Persona" className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-full transition-colors"><TrashIcon /></button>
          </div>
        </div>
      ))}
    </div>
  );
};