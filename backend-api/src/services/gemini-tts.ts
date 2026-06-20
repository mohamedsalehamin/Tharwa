/**
 * Gemini 3.1 Flash TTS — production voiceover for gold daily shorts.
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_VOICE = 'Autonoe';
const DEFAULT_STYLE =
  'Read in Egyptian Arabic dialect with an energetic, clear promotional tone for a finance app. Pronounce numbers naturally.';

export type GeminiTtsOptions = {
  apiKey?: string;
  model?: string;
  voice?: string;
  stylePrompt?: string;
};

function resolveApiKey(override?: string): string {
  const key =
    override ??
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new Error(
      'Missing GEMINI_API_KEY (or GOOGLE_API_KEY). Get one at https://aistudio.google.com/apikey',
    );
  }
  return key;
}

/** Wrap raw PCM (s16le mono) in a WAV container. */
export function pcmToWav(
  pcm: Buffer,
  sampleRate = 24_000,
  channels = 1,
  bitDepth = 16,
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function buildPrompt(text: string, stylePrompt: string): string {
  return `${stylePrompt}\n\n${text}`;
}

type GeminiInlineData = {
  mimeType?: string;
  data?: string;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: GeminiInlineData }> };
  }>;
  error?: { message?: string };
};

export async function synthesizeGeminiTts(
  text: string,
  outputPath: string,
  options: GeminiTtsOptions = {},
): Promise<void> {
  const apiKey = resolveApiKey(options.apiKey);
  const model = options.model ?? process.env.GEMINI_TTS_MODEL ?? DEFAULT_MODEL;
  const voice = options.voice ?? process.env.GEMINI_TTS_VOICE ?? DEFAULT_VOICE;
  const stylePrompt = options.stylePrompt ?? process.env.GEMINI_TTS_STYLE ?? DEFAULT_STYLE;

  const url = `${GEMINI_API_BASE}/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(text, stylePrompt) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    }),
  });

  const payload = (await response.json()) as GeminiGenerateResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `Gemini TTS failed: ${response.status} ${response.statusText}`,
    );
  }

  const b64 = payload.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) {
    throw new Error('Gemini TTS returned no audio data');
  }

  const pcm = Buffer.from(b64, 'base64');
  const wav = pcmToWav(pcm);
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, wav);
}
