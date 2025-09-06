import { head, put } from '@vercel/blob'; // Import head and put
import { Issue } from '../types';

async function readDb(): Promise<{ personas: any[]; issues: Issue[] }> {
  try {
    const blobInfo = await head('issues_data'); // Use head to get blob info
    if (blobInfo) {
      const response = await fetch(blobInfo.url); // Fetch content from the URL
      const text = await response.text();
      return JSON.parse(text);
    }
    // If blob is empty or not found, return a default structure
    return { personas: [], issues: [] };
  } catch (error) {
    console.error('Failed to read from Vercel Blob:', error);
    // In case of an error reading from Blob, return a default structure
    // or re-throw if you want to propagate the error.
    return { personas: [], issues: [] };
  }
}

async function writeDb(data: { personas: any[]; issues: Issue[] }): Promise<void> {
  await put('issues_data', JSON.stringify(data, null, 2), {
    contentType: 'application/json',
    access: 'public', // Add access: 'public' here
  });
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
