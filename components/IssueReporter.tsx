import React, { useState, useEffect } from 'react';
import { Issue } from '../types';
import * as geminiService from '../services/geminiService';
import { CloseIcon, SendIcon, MagicWandIcon } from './icons';

interface IssueReporterProps {
  isOpen: boolean;
  onClose: () => void;
}

const TabButton: React.FC<{ onClick: () => void; isActive: boolean; children: React.ReactNode }> = ({ onClick, isActive, children }) => (
  <button
    onClick={onClick}
    className={`whitespace-nowrap px-3 py-1 sm:px-4 sm:py-1.5 text-sm font-semibold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600'
    }`}
  >
    {children}
  </button>
);

export const IssueReporter: React.FC<IssueReporterProps> = ({ isOpen, onClose }) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [rawText, setRawText] = useState('');
  const [refinedIssue, setRefinedIssue] = useState<{ title: string; body: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'submit' | 'list'>('submit');

  useEffect(() => {
    if (isOpen) {
      const fetchIssues = async () => {
        setIsLoading(true);
        try {
          const response = await fetch('/api/issues');
          if (!response.ok) {
            throw new Error('Failed to fetch issues.');
          }
          const data = await response.json();
          setIssues(data.sort((a: Issue, b: Issue) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchIssues();
    }
  }, [isOpen]);

  const handleRefineText = async () => {
    if (!rawText.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await geminiService.refineIssueText(rawText);
      setRefinedIssue(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refine text.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostNewIssue = async (issueData: { title: string; body: string }) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issueData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit issue.');
      }
      const newIssue = await response.json();
      setIssues(prev => [newIssue, ...prev]);
      setRawText('');
      setRefinedIssue(null);
      setActiveTab('list'); // Switch to list view after submission
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit issue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitRefinedIssue = async () => {
    if (!refinedIssue) return;
    await handlePostNewIssue(refinedIssue);
  };

  const handleSubmitRawIssue = async () => {
    if (!rawText.trim()) return;
    const newIssue = {
      title: rawText.substring(0, 50) + (rawText.length > 50 ? '...' : ''),
      body: rawText,
    };
    await handlePostNewIssue(newIssue);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <header className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">Feedback & Issues</h2>
            <div className="flex flex-wrap gap-1 p-1 bg-gray-900/50 rounded-lg">
              <TabButton isActive={activeTab === 'submit'} onClick={() => setActiveTab('submit')}>Submit</TabButton>
              <TabButton isActive={activeTab === 'list'} onClick={() => setActiveTab('list')}>List</TabButton>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon /></button>
        </header>
        
        <main className="flex-grow p-6 overflow-y-auto">
          {activeTab === 'submit' && (
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-semibold">Submit New Feedback</h3>
              <p className="text-sm text-gray-400">不具合の報告や機能の要望などを下のテキストエリアに自由にご記入ください。</p>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="例：ペルソナを削除しようとすると、エラーが出て消せない。"
                className="w-full h-32 bg-gray-900 rounded-md p-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                disabled={isLoading || isSubmitting}
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={handleRefineText} disabled={isLoading || isSubmitting || !rawText.trim()} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800/50 transition-colors rounded-md">
                  <MagicWandIcon />
                  {isLoading && !isSubmitting ? 'AI is thinking...' : 'AIで清書する'}
                </button>
                <button onClick={handleSubmitRawIssue} disabled={isSubmitting || !rawText.trim()} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800/50 transition-colors rounded-md">
                  <SendIcon />
                  このまま送信
                </button>
              </div>

              {refinedIssue && (
                <div className="bg-gray-900/50 p-4 rounded-lg space-y-4 border border-gray-700">
                  <h4 className="text-md font-semibold">AIによる清書案</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-400">Title</label>
                    <input type="text" value={refinedIssue.title} onChange={(e) => setRefinedIssue(p => p ? {...p, title: e.target.value} : null)} className="w-full bg-gray-800 rounded-md p-2 mt-1 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400">Body</label>
                    <textarea value={refinedIssue.body} onChange={(e) => setRefinedIssue(p => p ? {...p, body: e.target.value} : null)} rows={5} className="w-full bg-gray-800 rounded-md p-2 mt-1 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <button onClick={handleSubmitRefinedIssue} disabled={isSubmitting} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-800/50 transition-colors rounded-md">
                    <SendIcon />
                    {isSubmitting ? 'Submitting...' : '清書案を送信'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'list' && (
            <div className="flex flex-col gap-4 min-h-0">
              <h3 className="text-lg font-semibold">Submitted Issues</h3>
              <div className="space-y-3 overflow-y-auto flex-grow pr-2">
                {isLoading && !issues.length && <p className="text-sm text-gray-500 text-center py-4">Loading issues...</p>}
                {error && <p className="text-sm text-red-400 text-center py-4">{error}</p>}
                {!isLoading && !error && issues.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No issues submitted yet.</p>}
                {issues.map(issue => (
                  <div key={issue.id} className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                    <h4 className="font-bold text-gray-200">{issue.title}</h4>
                    <p className="text-xs text-gray-400 mt-1">Status: <span className={`font-semibold ${issue.status === 'open' ? 'text-green-400' : 'text-red-400'}`}>{issue.status}</span> | Created: {new Date(issue.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
