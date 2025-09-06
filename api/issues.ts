import { promises as fs } from 'fs';
import path from 'path';
import { Issue } from '../types';

const dbPath = path.resolve(process.cwd(), 'api', 'db.json');

async function readDb(): Promise<{ personas: any[]; issues: Issue[] }> {
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is empty, return a default structure
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { personas: [], issues: [] };
    }
    throw error;
  }
}

async function writeDb(data: any): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getIssuesHandler(req: any, res: any) {
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