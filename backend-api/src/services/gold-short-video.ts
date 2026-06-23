import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { Env } from '../config/env.js';
import { probeAudioDurationSeconds } from './gold-voice-synthesis.js';
import { renderSvgToPng } from './social-image.js';
import { fillTemplate, loadSocialTemplateSvg, stripSvgForTiktokDirectPost } from './social-templates.js';

const execFileAsync = promisify(execFile);

const BRAND_NAVY = '#0A1A2F';
const CARD_BG = '#14253f';
const CTA = { left: 72, top: 880, width: 936, height: 88 };
const VERTICAL_PAD = Math.floor((1920 - 1080) / 2);

export type GoldShortVideoResult = {
  videoPath: string;
  videoWithVoicePath: string | null;
  pngPath: string;
  seconds: number;
};

export async function ensureFfmpegAvailable(): Promise<void> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
  } catch {
    throw new Error('ffmpeg not found on PATH (required for gold short video generation)');
  }
}

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

async function splitCtaLayers(squarePng: Buffer): Promise<{ baseSquare: Buffer; cta: Buffer }> {
  const cta = await sharp(squarePng)
    .extract({ left: CTA.left, top: CTA.top, width: CTA.width, height: CTA.height })
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

async function renderSilentVideo(
  baseVerticalPng: Buffer,
  ctaPng: Buffer | null,
  outputPath: string,
  seconds: number,
): Promise<void> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gold-short-'));
  const basePath = path.join(workDir, 'base.png');
  try {
    await fs.writeFile(basePath, baseVerticalPng);

    if (!ctaPng) {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-loop',
          '1',
          '-i',
          basePath,
          '-t',
          String(seconds),
          '-r',
          '30',
          '-vf',
          'format=yuv420p',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          outputPath,
        ],
        { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
      );
      return;
    }

    const ctaPath = path.join(workDir, 'cta.png');
    await fs.writeFile(ctaPath, ctaPng);

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
      { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
    );
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
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
    { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
  );
}

/** Render gold-daily SVG vars → 9:16 MP4 (+ optional voice mux). */
export async function renderGoldShortVideo(args: {
  env: Env;
  vars: Record<string, string>;
  outputDir: string;
  voicePath?: string | null;
  minSeconds?: number;
  /** Strip logo/CTA for TikTok Content Posting API compliance. */
  forTiktok?: boolean;
}): Promise<GoldShortVideoResult> {
  await ensureFfmpegAvailable();
  await fs.mkdir(args.outputDir, { recursive: true });

  let seconds = args.minSeconds ?? 8;
  if (args.voicePath) {
    seconds = Math.max(seconds, Math.ceil(await probeAudioDurationSeconds(args.voicePath)));
  }

  const svgTemplate = await loadSocialTemplateSvg(args.env, 'gold_daily');
  const filled = fillTemplate(svgTemplate, args.vars);
  const svg = args.forTiktok ? stripSvgForTiktokDirectPost(filled) : filled;
  const squarePng = await renderSvgToPng(svg, args.env);
  const framePng = await toVerticalFrame(squarePng);
  let baseVertical: Buffer;
  let ctaPng: Buffer | null = null;
  if (args.forTiktok) {
    baseVertical = framePng;
  } else {
    const { baseSquare, cta } = await splitCtaLayers(squarePng);
    baseVertical = await toVerticalFrame(baseSquare);
    ctaPng = cta;
  }

  const pngPath = path.join(args.outputDir, 'gold-daily-frame.png');
  const videoPath = path.join(args.outputDir, 'gold-daily-silent.mp4');
  const videoWithVoicePath = path.join(args.outputDir, 'gold-daily.mp4');

  await fs.writeFile(pngPath, framePng);
  await renderSilentVideo(baseVertical, ctaPng, videoPath, seconds);

  if (args.voicePath) {
    await muxAudioVideo(videoPath, args.voicePath, videoWithVoicePath);
    return {
      videoPath,
      videoWithVoicePath,
      pngPath,
      seconds,
    };
  }

  await fs.copyFile(videoPath, videoWithVoicePath);
  return {
    videoPath,
    videoWithVoicePath: null,
    pngPath,
    seconds,
  };
}
