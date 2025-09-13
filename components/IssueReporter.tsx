import React, { useState, useEffect } from 'react';
import { Issue } from '../types';
import * as geminiService from '../services/geminiService';
import { CloseIcon, SendIcon, MagicWandIcon } from './icons';
import { WBS } from './WBS';

interface IssueReporterProps {
  isOpen: boolean;
  onClose: () => void;
}

const IssueDetailModal: React.FC<{ issue: Issue; onClose: () => void; }> = ({ issue, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-[70] p-4" onClick={onClose}>
      <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg shadow-2xl w-full max-w-2xl h-auto max-h-[80vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <header className="flex-shrink-0 flex justify-between items-center p-4 border-b border-border">
          <h3 className="text-lg font-bold text-card-foreground truncate pr-10">{issue.title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><CloseIcon /></button>
        </header>
        <main className="p-6 flex-grow overflow-y-auto">
          <div className="flex items-center gap-4 mb-4">
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                issue.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {issue.status}
              </span>
              <p className="text-sm text-muted-foreground">Created: {new Date(issue.createdAt).toLocaleString()}</p>
          </div>
          <div className="bg-background/50 p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Description</h4>
            <p className="text-foreground whitespace-pre-wrap">{issue.body}</p>
          </div>
        </main>
      </div>
    </div>
  );
};

export const IssueReporter: React.FC<IssueReporterProps> = ({ isOpen, onClose }) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [rawText, setRawText] = useState('');
  const [refinedIssue, setRefinedIssue] = useState<{ title: string; body: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'submit' | 'list' | 'wbs'>('submit');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  useEffect(() => {
    if (isOpen && (activeTab === 'list' || issues.length === 0)) {
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
  }, [isOpen, activeTab]);

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
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60] p-4" onClick={onClose}>
        <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
          <header className="flex-shrink-0 flex justify-between items-center p-4 border-b border-border">
            <h2 className="text-xl font-bold text-foreground">Feedback & Issues</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><CloseIcon /></button>
          </header>

          <div className="flex space-x-4 border-b border-border px-6">
            {(['submit', 'list', 'wbs'] as const).map((tab) => (
              <button
                key={tab}
                className={`py-3 px-2 -mb-px border-b-2 font-semibold text-sm capitalize transition-colors ${
                    activeTab === tab
                        ? 'border-accent text-accent'
                        : 'border-transparent text-muted-foreground hover:text-accent'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <main className="flex-grow p-6 overflow-y-auto">
            {activeTab === 'submit' && (
              <div className="flex flex-col gap-4">
                <h3 className="text-lg font-semibold text-foreground">Submit New Feedback</h3>
                <p className="text-sm text-muted-foreground">不具合の報告や機能の要望などを下のテキストエリアに自由にご記入ください。</p>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="例：ペルソナを削除しようとすると、エラーが出て消せない。"
                  className="w-full h-32 bg-background rounded-md p-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
                  disabled={isLoading || isSubmitting}
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={handleRefineText} disabled={isLoading || isSubmitting || !rawText.trim()} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-colors rounded-md">
                    <MagicWandIcon />
                    {isLoading && !isSubmitting ? 'AI is thinking...' : 'AIで清書する'}
                  </button>
                  <button onClick={handleSubmitRawIssue} disabled={isSubmitting || !rawText.trim()} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm bg-muted text-muted-foreground hover:bg-muted/90 disabled:opacity-50 transition-colors rounded-md">
                    <SendIcon />
                    このまま送信
                  </button>
                </div>

                {refinedIssue && (
                  <div className="bg-background/50 p-4 rounded-lg space-y-4 border border-border">
                    <h4 className="text-md font-semibold text-foreground">AIによる清書案</h4>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground">Title</label>
                      <input type="text" value={refinedIssue.title} onChange={(e) => setRefinedIssue(p => p ? {...p, title: e.target.value} : null)} className="w-full bg-muted rounded-md p-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-accent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground">Body</label>
                      <textarea value={refinedIssue.body} onChange={(e) => setRefinedIssue(p => p ? {...p, body: e.target.value} : null)} rows={5} className="w-full bg-muted rounded-md p-2 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-accent" />
                    </div>
                    <button onClick={handleSubmitRefinedIssue} disabled={isSubmitting} className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white transition-colors rounded-md">
                      <SendIcon />
                      {isSubmitting ? 'Submitting...' : '清書案を送信'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'list' && (
              <div className="flex flex-col gap-4 min-h-0">
                <h3 className="text-lg font-semibold text-foreground">Submitted Issues</h3>
                <div className="space-y-3 overflow-y-auto flex-grow pr-2">
                  {isLoading && !issues.length && <p className="text-sm text-muted-foreground text-center py-4">Loading issues...</p>}
                  {error && <p className="text-sm text-red-400 text-center py-4">{error}</p>}
                  {!isLoading && !error && issues.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No issues submitted yet.</p>}
                  {issues.map(issue => (
                    <div key={issue.id} onClick={() => setSelectedIssue(issue)} className="bg-background/50 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/70 transition-colors">
                      <h4 className="font-bold text-foreground truncate">{issue.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">Status: <span className={`font-semibold ${issue.status === 'open' ? 'text-green-400' : 'text-red-400'}`}>{issue.status}</span> | Created: {new Date(issue.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'wbs' && (
              <WBS />
            )}
          </main>
        </div>
      </div>
      {selectedIssue && <IssueDetailModal issue={selectedIssue} onClose={() => setSelectedIssue(null)} />}
    </>
  );
};