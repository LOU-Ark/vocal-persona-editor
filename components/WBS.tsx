import React, { useState, useEffect } from 'react';
import { Loader } from './Loader';
import { ChevronRightIcon } from './icons';

// --- Type Definitions ---
interface WbsIssue {
  id: string;
  title: string;
  status: 'open' | 'closed';
}

interface WBSNodeData {
  name: string;
  items?: WBSNodeData[];
  issues?: WbsIssue[];
}

// --- Recursive Node Component ---
const WBSNode: React.FC<{ node: WBSNodeData; level: number }> = ({ node, level }) => {
  const [isOpen, setIsOpen] = useState(level < 2); // Auto-expand first few levels

  const nodeName = node.name || (node as any).category;
  const subItems = node.items || (node as any).sub_categories || (node as any).subCategories;

  const hasSubItems = subItems && subItems.length > 0;
  const hasIssues = node.issues && node.issues.length > 0;

  return (
    <div style={{ marginLeft: `${level * 1.5}rem` }}>
      <div
        className="flex items-center py-2 cursor-pointer group"
        onClick={() => setIsOpen(!isOpen)}
      >
        {(hasSubItems || hasIssues) ? (
          <ChevronRightIcon
            className={`h-4 w-4 mr-2 text-muted-foreground transition-transform group-hover:text-foreground ${isOpen ? 'rotate-90' : ''}`}
          />
        ) : (
          <div className="w-4 h-4 mr-2" /> // Placeholder for alignment
        )}
        <h3 className="font-semibold text-foreground select-none">{nodeName}</h3>
      </div>

      {isOpen && (
        <div className="border-l-2 border-border pl-4 ml-[7px]">
          {hasIssues && (
            <ul className="list-none p-0 my-2 space-y-2">
              {node.issues?.map((issue) => (
                <li key={issue.id} className="flex items-center text-sm py-1">
                  <span className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${issue.status === 'open' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-muted-foreground">{issue.title}</span>
                </li>
              ))}
            </ul>
          )}
          {hasSubItems && (
            <div className="space-y-1">
              {subItems?.map((subNode: WBSNodeData, index: number) => (
                <WBSNode key={`${subNode.name || (subNode as any).category}-${index}`} node={subNode} level={level + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// --- Main WBS Component ---
export const WBS: React.FC = () => {
  const [wbs, setWbs] = useState<WBSNodeData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWBS = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/wbs');
        if (!response.ok) throw new Error('Failed to fetch WBS data.');
        
        const rawData = await response.json();
        
        const normalizeWbsData = (data: any): WBSNodeData[] => {
            if (!data) return [];
            // Handle the case where the AI returns { "WBS": [...] }
            if (data.WBS && Array.isArray(data.WBS)) return data.WBS;
            // Handle the case where the db stores { "wbs": { "wbs": [...] } }
            if (data.wbs?.wbs && Array.isArray(data.wbs.wbs)) return data.wbs.wbs;
            // Handle the case where the db stores { "wbs": [...] }
            if (data.wbs && Array.isArray(data.wbs)) return data.wbs;
            // Handle the case where the data is already the array
            if (Array.isArray(data)) return data;
            return [];
        };

        const normalizedData = normalizeWbsData(rawData);
        
        if (normalizedData.length === 0) {
            console.warn("Normalized WBS data is empty. This may be expected if there are few issues.");
        }

        setWbs(normalizedData);
      } catch (err) {
        console.error("WBS Fetch Error:", err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWBS();
  }, []);

  if (isLoading) {
    return <div className="flex justify-center items-center p-8"><Loader /></div>;
  }

  if (error) {
    return <p className="text-red-500 text-center p-8">Error: {error}</p>;
  }

  if (!wbs || wbs.length === 0) {
    return <p className="text-muted-foreground text-center p-8">No WBS data available.</p>;
  }

  return (
    <div className="p-1">
      {wbs.map((node, index) => (
        <WBSNode key={`${node.name}-${index}`} node={node} level={0} />
      ))}
    </div>
  );
};