import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

// ESM-compatible way to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve .env file path relative to the project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import handlers. Since they are default exports, we can name them anything.
import configHandler from './config';
import geminiHandler from './gemini';
import ttsHandler from './tts';
import { getIssuesHandler, createIssueHandler } from './issues'; // Import issue handlers

const app = express();
const port = 3001;

// Enable CORS for all origins (for development purposes)
app.use(cors());
// Enable JSON body parsing for POST requests
app.use(express.json());

// Register API routes
// The actual handler functions from your files are now connected to express routes.
app.get('/api/config', (req, res) => configHandler(req, res));
app.post('/api/gemini', (req, res) => geminiHandler(req, res));
app.post('/api/tts', (req, res) => ttsHandler(req, res));

// Register Issue API routes
app.get('/api/issues', (req, res) => getIssuesHandler(req, res));
app.post('/api/issues', (req, res) => createIssueHandler(req, res));

app.listen(port, () => {
  console.log(`✅ API server listening at http://localhost:${port}`);
});