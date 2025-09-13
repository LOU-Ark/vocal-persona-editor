import { head, put } from '@vercel/blob';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Issue } from '../types';
import { generateWBSFromIssues } from './gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFilePath = path.resolve(__dirname, 'db.json');

async function readDb(): Promise<{ personas: any[]; issues: Issue[]; wbs?: any; issueCountForWbs?: number }> {
  if (process.env.VERCEL_ENV) {
    console.log("readDb: Reading from Vercel Blob...");
    try {
      const blobInfo = await head('issues_data');
      const response = await fetch(blobInfo.url);
      if (!response.ok) {
        if (response.status === 404) {
          console.log("readDb: Blob not found, returning default structure.");
          return { personas: [], issues: [] };
        }
        throw new Error(`Failed to fetch blob content: ${response.statusText}`);
      }
      const text = await response.text();
      if (!text) {
        console.log("readDb: Blob is empty, returning default structure.");
        return { personas: [], issues: [] };
      }
      return JSON.parse(text);
    } catch (error: any) {
      if (error.status === 404) {
        console.log("readDb: Blob not found, returning default structure.");
        return { personas: [], issues: [] };
      }
      console.error('Failed to read from Vercel Blob:', error);
      return { personas: [], issues: [] };
    }
  } else {
    console.log("readDb: Reading from local db.json...");
    try {
      const fileContent = await fs.readFile(dbFilePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log("readDb: db.json not found, returning default structure.");
        return { personas: [], issues: [] };
      }
      console.error('Failed to read from local db.json:', error);
      throw error;
    }
  }
}

async function writeDb(data: any): Promise<void> {
  if (process.env.VERCEL_ENV) {
    console.log("writeDb: Writing to Vercel Blob...");
    await put('issues_data', JSON.stringify(data, null, 2), {
      contentType: 'application/json',
      access: 'public',
      allowOverwrite: true,
    });
  } else {
    console.log("writeDb: Writing to local db.json...");
    await fs.writeFile(dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

export async function getIssuesHandler(req: any, res: any) {
  console.log("getIssuesHandler: Received request");
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const db = await readDb();
    res.status(200).json(db.issues || []);
  } catch (error) {
    console.error('Failed to read issues from database:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve issues.' });
  }
}

export async function createIssueHandler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'Bad Request', message: 'Title and body are required.' });
    }

    const db = await readDb();
    const newIssue: Issue = {
      id: `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      body,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.issues.push(newIssue);
    await writeDb(db);

    res.status(201).json(newIssue);
  } catch (error) {
    console.error('Failed to create issue:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create issue.' });
  }
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return getIssuesHandler(req, res);
  } else if (req.method === 'POST') {
    return createIssueHandler(req, res);
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
}

export async function getWbsHandler(req: any, res: any) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        const db = await readDb();
        const issues = db.issues || [];
        const issueCount = issues.length;
        const cachedIssueCount = db.issueCountForWbs || 0;

        if (issueCount - cachedIssueCount >= 5 || !db.wbs) {
            console.log("Generating new WBS...");
            const newWbs = await generateWBSFromIssues(issues);
            db.wbs = newWbs;
            db.issueCountForWbs = issueCount;
            await writeDb(db);
            res.status(200).json(newWbs);
        } else {
            console.log("Returning cached WBS...");
            res.status(200).json(db.wbs);
        }
    } catch (error) {
        console.error('Failed to get WBS:', error);
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get WBS.' });
    }
}