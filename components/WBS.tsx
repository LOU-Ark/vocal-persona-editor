
import React, { useState, useEffect } from 'react';
import { Issue } from '../types';
import * as geminiService from '../services/geminiService';
import { Loader } from './Loader';

interface WBSNode {
  category: string;
  issues: { id: string; title: string; status: 'open' | 'closed' }[];
  subCategories?: WBSNode[];
}

export const WBS: React.FC = () => {
  const [wbs, setWbs] = useState<WBSNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateWBS = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/issues');
        if (!response.ok) {
          throw new Error('Failed to fetch issues.');
        }
        const issues: Issue[] = await response.json();

        if (issues.length === 0) {
          setWbs([]);
          setIsLoading(false);
          return;
        }

        const wbsData = await geminiService.generateWBSFromIssues(issues);
        setWbs(wbsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    generateWBS();
  }, []);

  const renderWBSNode = (node: WBSNode, level: number = 0) => (
    <div key={node.category} style={{ marginLeft: level * 20 }} className="mb-4">
      <h3 className={`text-lg font-semibold ${level === 0 ? 'text-indigo-400' : 'text-gray-300'}`}>
        {node.category}
      </h3>
      <ul className="list-disc list-inside mt-2">
        {node.issues.map(issue => (
          <li key={issue.id} className="text-gray-400">
            <span className={`mr-2 ${issue.status === 'open' ? 'text-green-500' : 'text-red-500'}`}>●</span>
            {issue.title}
          </li>
        ))}
      </ul>
      {node.subCategories && (
        <div className="mt-2">
          {node.subCategories.map(subNode => renderWBSNode(subNode, level + 1))}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><Loader /></div>;
  }

  if (error) {
    return <p className="text-red-400 text-center">{error}</p>;
  }

  if (!wbs || wbs.length === 0) {
    return <p className="text-gray-500 text-center">No issues to display in WBS.</p>;
  }

  return (
    <div className="p-4">
      {wbs.map(node => renderWBSNode(node))}
    </div>
  );
};
