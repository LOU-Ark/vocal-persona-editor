import { head, put } from '@vercel/blob';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Persona, Issue } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFilePath = path.resolve(__dirname, 'db.json');

// Define the shape of our database
interface DbShape {
  personas: Persona[];
  issues: Issue[];
  wbs?: any;
  issueCountForWbs?: number;
}

// This function reads the entire database from either Vercel Blob or the local db.json file.
async function readDb(): Promise<DbShape> {
  const defaultDb: DbShape = { personas: [], issues: [] };
  
  // Check if running in Vercel production environment
  if (process.env.VERCEL_ENV) {
    try {
      // In production, read from Vercel Blob
      const blobInfo = await head('issues_data'); // Using a shared blob name
      const response = await fetch(blobInfo.url);
      if (!response.ok) {
        if (response.status === 404) return defaultDb; // If blob doesn't exist, return default
        throw new Error(`Failed to fetch blob content: ${response.statusText}`);
      }
      const text = await response.text();
      if (!text) return defaultDb; // If blob is empty, return default
      return JSON.parse(text);
    } catch (error: any) {
      if (error.status === 404) return defaultDb;
      console.error('Failed to read from Vercel Blob:', error);
      return defaultDb;
    }
  } else {
    // In local development, read from db.json
    try {
      const fileContent = await fs.readFile(dbFilePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error: any) {
      if (error.code === 'ENOENT') return defaultDb; // If file doesn't exist, return default
      console.error('Failed to read from local db.json:', error);
      throw error;
    }
  }
}

// This function writes the entire database object to either Vercel Blob or the local db.json file.
async function writeDb(data: DbShape): Promise<void> {
  if (process.env.VERCEL_ENV) {
    // In production, write to Vercel Blob
    await put('issues_data', JSON.stringify(data, null, 2), {
      contentType: 'application/json',
      access: 'public',
      allowOverwrite: true,
    });
  } else {
    // In local development, write to db.json
    await fs.writeFile(dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

// API handler to get all personas
export async function getPersonasHandler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const db = await readDb();
    res.status(200).json(db.personas || []);
  } catch (error) {
    console.error('Failed to read personas from database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// API handler to save all personas
export async function savePersonasHandler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const newPersonas: Persona[] = req.body;
    if (!Array.isArray(newPersonas)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Request body must be an array of personas.' });
    }
    const db = await readDb();
    db.personas = newPersonas; // Overwrite the personas array
    await writeDb(db);
    res.status(200).json({ message: 'Personas saved successfully.' });
  } catch (error) {
    console.error('Failed to save personas to database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Default handler for Vercel Serverless Function
export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return getPersonasHandler(req, res);
  } else if (req.method === 'POST') {
    return savePersonasHandler(req, res);
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
}
