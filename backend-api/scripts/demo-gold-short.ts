/**
 * Local demo: render gold-daily PNG → 9:16 frame → MP4 via ffmpeg.
 * CTA (yellow button) pulses zoom in/out; rest of frame stays static.
 *
 * Usage (from backend-api):
 *   npm run demo:gold-short
 *
 * Requires: ffmpeg on PATH (`brew install ffmpeg`)
 * Output:   demo/gold-short-demo.mp4 (+ frame/layer PNGs)
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { Env } from '../src/config/env.js';
import { renderSvgToPng } from '../src/services/social-image.js';
import { fillTemplate, loadSocialTemplateSvg } from '../src/services/social-templates.js';

const execFileAsync = promisify(execFile);

const BRAND_NAVY = '#0A1A2F';
const CARD_BG = '#14253f';
const OUTPUT_DIR = path.resolve('demo');
const FRAME_PATH = path.join(OUTPUT_DIR, 'gold-short-frame.png');
const BASE_PATH = path.join(OUTPUT_DIR, 'gold-short-base.png');
const CTA_PATH = path.join(OUTPUT_DIR, 'gold-short-cta.png');
const VIDEO_PATH = path.join(OUTPUT_DIR, 'gold-short-demo.mp4');
const VIDEO_WITH_VOICE_PATH = path.join(OUTPUT_DIR, 'gold-short-with-voice.mp4');
const DEFAULT_VOICE_PATH = path.join(OUTPUT_DIR, 'gold-short-voice.wav');

/** Matches gold-daily.svg CTA group at translate(72, 880). */
const CTA = { left: 72, top: 880, width: 936, height: 88 };

const VERTICAL_PAD = Math.floor((1920 - 1080) / 2);

const DEMO_ENV = {
  SOCIAL_TEMPLATES_DIR: './assets/social-templates',
} as Env;

function demoVars(): Record<string, string> {
  const dateAr = new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return {
    DATE_AR: dateAr,
    GOLD_18: '3,520',
    GOLD_21: '4,120',
    GOLD_24: '4,705',
    GOLD_POUND: '32,960',
    GOLD_OUNCE: '285,400',
    CHANGE_HEADLINE: 'انخفاض 40 ج منذ افتتاح اليوم',
    CHANGE_COLOR: '#FF3B30',
    CHANGE_PCT: '-1.0%',
    REF_PRICE: '4,160',
    CURRENT_PRICE: '4,120',
    HEADLINE: 'أسعار الذهب تواصل الانخفاض ❗',
    BODY_PARAGRAPH:
      'انخفضت أسعار الذهب محلياً بما يقارب 40 جنيهاً مقارنةً بسعر افتتاح اليوم، ليتداول عيار 21 الآن عند 4,120 ج للجرام.',
    PLAY_STORE_URL: 'https://thrwa.co/download/android',
    APP_STORE_URL: 'https://thrwa.co/download/ios',
  };
}

async function ensureFfmpeg(): Promise<void> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
  } catch {
    throw new Error('ffmpeg not found. Install with: brew install ffmpeg');
  }
}

/** Pad 1080×1080 social PNG to 1080×1920 (TikTok / Shorts). */
async function toVerticalFrame(squarePng: Buffer): Promise<Buffer> {
  return sharp(squarePng)
    .resize(1080, 1080, { fit: 'fill' })
    .extend({
      top: VERTICAL_PAD,
      bottom: 1920 - 1080 - VERTICAL_PAD,
      left: 0,
      right: 0,
      background: BRAND_NAVY,
    })
    .png()
    .toBuffer();
}

/** Split CTA layer; patch card background where the button was. */
async function splitCtaLayers(squarePng: Buffer): Promise<{ baseSquare: Buffer; cta: Buffer }> {
  const cta = await sharp(squarePng)
    .extract({
      left: CTA.left,
      top: CTA.top,
      width: CTA.width,
      height: CTA.height,
    })
    .png()
    .toBuffer();

  const patch = await sharp({
    create: {
      width: CTA.width,
      height: CTA.height,
      channels: 4,
      background: CARD_BG,
    },
  })
    .png()
    .toBuffer();

  const baseSquare = await sharp(squarePng)
    .composite([{ input: patch, left: CTA.left, top: CTA.top }])
    .png()
    .toBuffer();

  return { baseSquare, cta };
}

function ctaCenterOnVerticalFrame(): { x: number; y: number } {
  return {
    x: CTA.left + CTA.width / 2,
    y: VERTICAL_PAD + CTA.top + CTA.height / 2,
  };
}

async function renderVideoWithCtaPulse(
  basePath: string,
  ctaPath: string,
  outputPath: string,
  seconds = 8,
): Promise<void> {
  const fps = 30;
  const center = ctaCenterOnVerticalFrame();
  const pulsePeriodSec = 1.4;
  const pulseAmount = 0.07;
  const scaleExpr = `${CTA.width}*(1+${pulseAmount}*sin(2*PI*t/${pulsePeriodSec}))`;
  const scaleHExpr = `${CTA.height}*(1+${pulseAmount}*sin(2*PI*t/${pulsePeriodSec}))`;

  const filter = [
    `[1:v]format=rgba,scale=w='${scaleExpr}':h='${scaleHExpr}':eval=frame[cta]`,
    `[0:v][cta]overlay=x='${center.x}-w/2':y='${center.y}-h/2':format=auto,format=yuv420p[v]`,
  ].join(';');

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-i',
      basePath,
      '-loop',
      '1',
      '-i',
      ctaPath,
      '-filter_complex',
      filter,
      '-map',
      '[v]',
      '-t',
      String(seconds),
      '-r',
      String(fps),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
}

async function probeAudioDurationSeconds(audioPath: string): Promise<number> {
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

async function muxAudioVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 },
  );
}

function parseArgs(argv: string[]): { voicePath: string | null; seconds: number | null } {
  let voicePath: string | null = null;
  let seconds: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--voice') {
      voicePath = path.resolve(argv[++i] ?? DEFAULT_VOICE_PATH);
    } else if (arg === '--seconds') {
      seconds = Number(argv[++i]);
    }
  }

  return { voicePath, seconds };
}

async function main(): Promise<void> {
  const { voicePath, seconds: secondsArg } = parseArgs(process.argv.slice(2));
  await ensureFfmpeg();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let videoSeconds = secondsArg ?? 8;
  if (voicePath) {
    await fs.access(voicePath);
    videoSeconds = Math.max(videoSeconds, Math.ceil(await probeAudioDurationSeconds(voicePath)));
  }

  const svgTemplate = await loadSocialTemplateSvg(DEMO_ENV, 'gold_daily');
  const svg = fillTemplate(svgTemplate, demoVars());
  const squarePng = await renderSvgToPng(svg, DEMO_ENV);

  const { baseSquare, cta } = await splitCtaLayers(squarePng);
  const baseVertical = await toVerticalFrame(baseSquare);
  const framePng = await toVerticalFrame(squarePng);

  await fs.writeFile(FRAME_PATH, framePng);
  await fs.writeFile(BASE_PATH, baseVertical);
  await fs.writeFile(CTA_PATH, cta);
  console.log('Wrote frame:', FRAME_PATH);
  console.log('Wrote base (no CTA):', BASE_PATH);
  console.log('Wrote CTA layer:', CTA_PATH);

  await renderVideoWithCtaPulse(BASE_PATH, CTA_PATH, VIDEO_PATH, videoSeconds);
  console.log('Wrote video:', VIDEO_PATH, `(${videoSeconds}s)`);

  if (voicePath) {
    console.log('Muxing voice:', voicePath);
    await muxAudioVideo(VIDEO_PATH, voicePath, VIDEO_WITH_VOICE_PATH);
    console.log('Wrote video with voice:', VIDEO_WITH_VOICE_PATH);
    console.log('Open with: open demo/gold-short-with-voice.mp4');
    return;
  }

  console.log('Open with: open demo/gold-short-demo.mp4');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
