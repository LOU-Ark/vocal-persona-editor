
import React, { useState, useEffect } from 'react';
import { Issue } from '../types';
import * as geminiService from '../services/geminiService';
import { Loader } from './Loader';

interface WBSNode {
  category: string;
  issues?: { id: string; title: string; status: 'open' | 'closed' }[];
  subCategories?: WBSNode[];
}

// Helper function to normalize the WBS data
const normalizeWbsData = (data: any): WBSNode[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.WBS)) return data.WBS;
    if (Array.isArray(data.wbs)) return data.wbs;
    if (Array.isArray(data.nodes)) return data.nodes;
    if (Array.isArray(data.children)) return data.children;
    if (data.name && Array.isArray(data.children)) return [data]; // Handle root object
    return [];
};


export const WBS: React.FC = () => {
  const [wbs, setWbs] = useState<WBSNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string[]>([]);

  useEffect(() => {
    const generateWBS = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/issues');
        if (!response.ok) throw new Error('Failed to fetch issues.');
        const issues: Issue[] = await response.json();

        if (issues.length === 0) {
          setWbs([]);
          return;
        }

        const rawWbsData = await geminiService.generateWBSFromIssues(issues);
        const normalizedData = normalizeWbsData(rawWbsData);
        
        if (normalizedData.length === 0) {
            throw new Error("WBS data could not be normalized or is empty.");
        }

        setWbs(normalizedData);

      } catch (err) {
        console.error("WBS: Error processing WBS data:", err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    generateWBS();
  }, []);

  const handleNodeClick = (path: string[]) => {
    setActivePath(path);
  };

  const getCurrentNodes = () => {
    if (!wbs) return [];
    let currentLevel = wbs;
    for (const key of activePath) {
        const node = currentLevel.find(n => n.category === key);
        if (node && node.subCategories) {
            currentLevel = node.subCategories;
        } else {
            // Path is invalid or has no subcategories, stop traversing
            return node?.issues || [];
        }
    }
    return currentLevel;
  };

  const renderBreadcrumbs = () => (
    <div className="mb-4 text-sm text-gray-400">
      <span onClick={() => setActivePath([])} className="cursor-pointer hover:text-indigo-400">WBS Root</span>
      {activePath.map((path, index) => (
        <span key={index}>
          <span className="mx-2">/</span>
          <span 
            onClick={() => setActivePath(activePath.slice(0, index + 1))}
            className="cursor-pointer hover:text-indigo-400"
          >
            {path}
          </span>
        </span>
      ))}
    </div>
  );

  const renderNodeList = (nodes: any[]) => {
    if (nodes.every(node => node.hasOwnProperty('id')) ) {
        return (
            <ul className="list-disc list-inside mt-2 ml-6">
                {nodes.map(issue => (
                    <li key={issue.id} className="text-gray-400 text-sm">
                        <span className={`mr-2 ${issue.status === 'open' ? 'text-green-500' : 'text-red-500'}`}>●</span>
                        {issue.title}
                    </li>
                ))}
            </ul>
        )
    }

    return (
        <div>
            {nodes.map((node) => {
                const hasSubcategories = node.subCategories && node.subCategories.length > 0;

                return (
                    <div key={node.category} className="mb-2">
                        <div 
                            onClick={() => hasSubcategories && handleNodeClick([...activePath, node.category])}
                            className={`p-3 rounded-md transition-colors ${hasSubcategories ? 'cursor-pointer bg-gray-800 hover:bg-gray-700' : 'bg-gray-800/50'}`}>
                            <h3 className="font-semibold text-indigo-400">{node.category}</h3>
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><Loader /></div>;
  }

  if (error) {
    return <p className="text-red-400 text-center">Error: {error}</p>;
  }

  if (!wbs) {
    return <p className="text-gray-500 text-center">No WBS data available.</p>;
  }

  return (
    <div className="p-4">
        {renderBreadcrumbs()}
        {renderNodeList(getCurrentNodes())}
    </div>
  );
};
