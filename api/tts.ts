// This serverless function acts as a secure proxy to the Fish Audio API.
// It receives the request from the client-side, attaches the secret credentials,
// and forwards the request to the Fish Audio API. This avoids exposing the API
// token to the browser and bypasses CORS issues.

// The `any` types are used here because we cannot import Vercel's specific types
// in this environment. In a typical Vercel project, you would use:
// import type { VercelRequest, VercelResponse } from '@vercel/node';
// This handler is now compatible with Vercel's Node.js runtime.

// FIX: Declare Buffer to resolve TypeScript error when Node.js global types are not available.
declare const Buffer: { from(data: ArrayBuffer): any; };

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // In a Vercel Node.js environment, the body is pre-parsed on `req.body`.
        const { text, token: requestToken, voiceId: requestVoiceId, voiceConfigId } = req.body;

        let token: string;
        let voiceId: string;

        if (voiceConfigId === 'default_voice') {
            const defaultToken = process.env.FISH_AUDIO_DEFAULT_TOKEN;
            if (!defaultToken) {
                const errorMessage = "Server configuration error: The default voice is enabled, but FISH_AUDIO_DEFAULT_TOKEN is not set on the server.";
                console.error(errorMessage);
                return res.status(500).json({ error: "Server Configuration Error", message: errorMessage });
            }
            token = defaultToken;
            voiceId = requestVoiceId; // This is the default voice ID from env, passed by client
        } else {
            token = requestToken;
            voiceId = requestVoiceId;
        }

        if (!text || !token || !voiceId) {
            return res.status(400).json({ error: 'Missing required parameters: text, token, voiceId' });
        }

        const API_URL = "https://api.fish.audio/v1/tts";
        const fishAudioResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                "reference_id": voiceId,
                "text": text,
            }),
        });
        
        if (fishAudioResponse.ok && fishAudioResponse.headers.get('Content-Type')?.includes('audio')) {
             // Convert the response body to a buffer to send it back.
            const audioBuffer = await fishAudioResponse.arrayBuffer();
            res.setHeader('Content-Type', fishAudioResponse.headers.get('Content-Type') || 'audio/mpeg');
            return res.status(200).send(Buffer.from(audioBuffer));

        } else {
            // Fish Audio returned an error or unexpected content type
            const errorBody = await fishAudioResponse.text();
            let errorMessage = `Fish Audio API failed with status: ${fishAudioResponse.status}`;
            try {
                // Try to parse as JSON for a more specific error message
                const errorJson = JSON.parse(errorBody);
                errorMessage = errorJson.detail || errorMessage;
            } catch (e) {
                 if (errorBody) {
                    errorMessage += ` - ${errorBody}`;
                }
            }
             return res.status(fishAudioResponse.status).json({ error: errorMessage });
        }

    } catch (error) {
        console.error("Error in /api/tts proxy:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown internal error occurred.";
        return res.status(500).json({ error: "Internal Server Error", message: errorMessage });
    }
}