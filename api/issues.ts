import { head, put } from '@vercel/blob';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Issue } from '../types';
import * as geminiService from '../services/geminiService'; // geminiServiceをインポート

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const useVercelBlob = false; 
const dbFilePath = path.resolve(__dirname, 'db.json');

async function readDb(): Promise<{ personas: any[]; issues: Issue[]; wbs?: any; issueCountForWbs?: number }> {
  // Vercel環境ではVercel Blobを使用し、ローカル環境ではdb.jsonを使用する
  if (process.env.VERCEL_ENV) {
    console.log("readDb: Reading from Vercel Blob...");
    try {
      const blobInfo = await head('issues_data');
      const response = await fetch(blobInfo.url);
      if (!response.ok) {
        // Blobが空の場合や他のHTTPエラーの場合、デフォルトの構造を返す
        if (response.status === 404) {
          console.log("readDb: Blob not found, returning default structure.");
          return { personas: [], issues: [] };
        }
        throw new Error(`Failed to fetch blob content: ${response.statusText}`);
      }
      const text = await response.text();
      // テキストが空の場合もデフォルト構造を返す
      if (!text) {
        console.log("readDb: Blob is empty, returning default structure.");
        return { personas: [], issues: [] };
      }
      return JSON.parse(text);
    } catch (error) {
      // --- 一時的なデバッグログ ---
      console.error('readDbでエラーをキャッチしました。エラーオブジェクト詳細:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      // --- デバッグログここまで ---

      // headが404を投げた場合（Blobが存在しない場合）
      if (error.status === 404) {
        console.log("readDb: Blob not found, returning default structure.");
        return { personas: [], issues: [] };
      }
      console.error('Failed to read from Vercel Blob:', error);
      // Vercel Blobからの読み込みに失敗した場合は、エラーを投げる代わりにデフォルト構造を返す
      return { personas: [], issues: [] };
    }
  } else {
    console.log("readDb: Reading from local db.json...");
    try {
      const fileContent = await fs.readFile(dbFilePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log("readDb: db.json not found, returning default structure.");
        return { personas: [], issues: [] }; // ファイルが存在しない場合はデフォルト構造を返す
      }
      console.error('Failed to read from local db.json:', error);
      throw error;
    }
  }
}

async function writeDb(data: any): Promise<void> {
  // Vercel環境ではVercel Blobを使用し、ローカル環境ではdb.jsonを使用する
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

// 新しいWBSデータを取得するハンドラーを追加
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
            const newWbs = await geminiService.generateWBSFromIssues(issues);
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