import { describe, expect, it } from 'vitest';
import { pcmToWav } from '../../src/services/gemini-tts.js';

describe('pcmToWav', () => {
  it('wraps PCM in a valid RIFF header', () => {
    const pcm = Buffer.alloc(4);
    const wav = pcmToWav(pcm);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.length).toBe(44 + pcm.length);
  });
});
