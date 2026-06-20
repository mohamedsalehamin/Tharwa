import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { synthesizeGeminiTts } from './gemini-tts.js';
import {
  buildGoldVoiceoverScript,
  normalizeForNamaaTts,
  type GoldVoiceoverInput,
} from './gold-voiceover-script.js';

const execFileAsync = promisify(execFile);

const DEFAULT_SPEED = 0.9;

function atempoFilter(speed: number): string {
  if (speed <= 0 || speed > 4) {
    throw new Error(`Invalid speed ${speed}; use e.g. 0.85–1.0`);
  }
  const filters: string[] = [];
  let remaining = speed;
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  while (remaining > 2) {
    filters.push('atempo=2.0');
    remaining /= 2;
  }
  if (Math.abs(remaining - 1) > 0.001) {
    filters.push(`atempo=${remaining.toFixed(4)}`);
  }
  return filters.length > 0 ? filters.join(',') : 'anull';
}

async function applySpeed(inputPath: string, outputPath: string, speed: number): Promise<void> {
  const filter = atempoFilter(speed);
  if (filter === 'anull') {
    await fs.copyFile(inputPath, outputPath);
    return;
  }
  await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-filter:a', filter, outputPath], {
    maxBuffer: 10 * 1024 * 1024,
  });
}

/** Gemini TTS for gold daily voiceover (intro + CTA in one call). */
export async function synthesizeGoldVoiceover(
  input: GoldVoiceoverInput,
  outputPath: string,
  speed = DEFAULT_SPEED,
): Promise<{ scriptText: string; durationSec: number }> {
  const { full } = buildGoldVoiceoverScript(input);
  const normalized = normalizeForNamaaTts(full);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gold-voice-'));
  const rawPath = path.join(tmpDir, 'raw.wav');
  try {
    await synthesizeGeminiTts(normalized, rawPath);
    await applySpeed(rawPath, outputPath, speed);
    const durationSec = await probeAudioDurationSeconds(outputPath);
    return { scriptText: full, durationSec };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function probeAudioDurationSeconds(audioPath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    audioPath,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Could not read audio duration: ${audioPath}`);
  }
  return seconds;
}
