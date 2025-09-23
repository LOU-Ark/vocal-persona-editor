
import { defineFlow, runFlow } from '@genkit-ai/flow';
import { generate } from '@genkit-ai/ai';
import { geminiPro } from '@genkit-ai/googleai';
import * as z from 'zod';
import { PersonaState, ChatMessage } from './types'; // Assuming types.ts is at the root

// Zod schema for PersonaState
const PersonaStateSchema = z.object({
  name: z.string(),
  role: z.string(),
  tone: z.string(),
  personality: z.string(),
  worldview: z.string(),
  experience: z.string(),
  other: z.string(),
  summary: z.string(),
  shortSummary: z.string().optional(),
  shortTone: z.string().optional(),
  sources: z.array(z.object({ title: z.string(), uri: z.string() })).optional(),
  mbtiProfile: z.any().optional(), // Define more strictly if needed
  voiceId: z.string().optional(),
});

// Zod schema for ChatMessage
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({ text: z.string() })),
});

export const personaChat = defineFlow(
  {
    name: 'personaChat',
    inputSchema: z.object({
      personaState: PersonaStateSchema,
      history: z.array(ChatMessageSchema),
    }),
    outputSchema: z.string(),
  },
  async ({ personaState, history }) => {
    const systemInstruction = `You are a character with the following traits. Respond as this character in Japanese.
- Name: ${personaState.name}
- Role: ${personaState.role}
- Tone: ${personaState.tone}
- Personality: ${personaState.personality}
- Worldview: ${personaState.worldview}
- Experience: ${personaState.experience}
- Other: ${personaState.other}
- Summary: ${personaState.summary}`;

    const latestMessage = history[history.length - 1];

    if (!latestMessage) {
      throw new Error('No message provided to send.');
    }

    const response = await generate({
      model: geminiPro,
      prompt: latestMessage.parts.map((part) => part.text).join('\n'),
      history: history.slice(0, -1),
      config: {
        systemInstruction: systemInstruction,
      },
    });

    return response.text();
  }
);
