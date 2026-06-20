/**
 * Gold daily voiceover — Gemini TTS only.
 *
 * Usage (from backend-api):
 *   npm run demo:gold-voice
 *   npm run demo:gold-short-full
 *
 * Requires:
 *   - GEMINI_API_KEY
 *   - ffmpeg (for --speed)
 */
import { execFile } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { synthesizeGeminiTts } from '../src/services/gemini-tts.js';
import {
  buildGoldVoiceoverScript,
  DEMO_GOLD_VOICEOVER,
  normalizeForNamaaTts,
  type GoldVoiceoverInput,
} from '../src/services/gold-voiceover-script.js';

const execFileAsync = promisify(execFile);

function loadLocalEnv(): void {
  const envPath = path.resolve('.env');
  if (!fsSync.existsSync(envPath)) return;
  const content = fsSync.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env) || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const DEFAULT_OUTPUT = path.resolve('demo/gold-short-voice.wav');
const DEFAULT_SPEED = 0.9;

type ParsedArgs = {
  full: string;
  output: string;
  speed: number;
  singleText: string | null;
};

function parseNumberArg(raw: string | undefined, fallback: number): number {
  return Number(String(raw ?? fallback).replace(/,/g, ''));
}

function parseArgs(argv: string[]): ParsedArgs {
  let prices: GoldVoiceoverInput = { ...DEMO_GOLD_VOICEOVER };
  let script = buildGoldVoiceoverScript(prices);
  let full = script.full;
  let output = DEFAULT_OUTPUT;
  let speed = DEFAULT_SPEED;
  let singleText: string | null = null;
  let scriptFromNumbers = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-t' || arg === '--text') {
      singleText = argv[++i] ?? singleText;
      scriptFromNumbers = false;
    } else if (arg === '-o' || arg === '--output') {
      output = path.resolve(argv[++i] ?? output);
    } else if (arg === '--speed') {
      speed = Number(argv[++i] ?? speed);
    } else if (arg === '--gold24') {
      prices.gold24Price = parseNumberArg(argv[++i], prices.gold24Price ?? 0);
    } else if (arg === '--gold21') {
      prices.gold21Price = parseNumberArg(argv[++i], prices.gold21Price);
    } else if (arg === '--gold18') {
      prices.gold18Price = parseNumberArg(argv[++i], prices.gold18Price ?? 0);
    } else if (arg === '--gold-pound') {
      prices.goldPoundPrice = parseNumberArg(argv[++i], prices.goldPoundPrice ?? 0);
    } else if (arg === '--gold-ounce') {
      prices.goldOuncePrice = parseNumberArg(argv[++i], prices.goldOuncePrice ?? 0);
    } else if (arg === '--change') {
      prices.changeEgpFromOpen = parseNumberArg(argv[++i], prices.changeEgpFromOpen);
    }
  }

  if (scriptFromNumbers && !singleText) {
    script = buildGoldVoiceoverScript(prices);
    full = script.full;
  }

  return { full, output, speed, singleText };
}

async function synthesizeVoice(text: string, outputPath: string): Promise<void> {
  const normalized = normalizeForNamaaTts(text);
  await synthesizeGeminiTts(normalized, outputPath);
}

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

async function generatePricesVoice(args: ParsedArgs): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-voice-'));
  const rawPath = path.join(tmpDir, 'raw.wav');
  try {
    console.log('Full voiceover (Gemini, 1 call):', args.full);
    await synthesizeVoice(args.full, rawPath);
    await applySpeed(rawPath, args.output, args.speed);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function generateSingleVoice(args: ParsedArgs): Promise<void> {
  const text = args.singleText!;
  console.log('Text:', text);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-voice-'));
  const rawPath = path.join(tmpDir, 'raw.wav');
  try {
    await synthesizeVoice(text, rawPath);
    await applySpeed(rawPath, args.output, args.speed);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log('Generating via Gemini…');

  if (args.singleText) {
    await generateSingleVoice(args);
  } else {
    await generatePricesVoice(args);
  }

  console.log('Wrote:', args.output);
  console.log('Open with: open', path.relative(process.cwd(), args.output));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
