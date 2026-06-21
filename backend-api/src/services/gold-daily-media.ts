import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Env } from '../config/env.js';
import { renderGoldShortVideo, ensureFfmpegAvailable } from './gold-short-video.js';
import type { GoldVoiceoverInput } from './gold-voiceover-script.js';
import { synthesizeGoldVoiceover } from './gold-voice-synthesis.js';
import { writePublicSocialImage, writePublicSocialVideo } from './social-image.js';

export type GoldDailyMediaBundle = {
  png: Buffer;
  pngPublicUrl: string;
  videoPublicUrl: string;
  videoBytes: Buffer;
  voiceScript: string;
  seconds: number;
};

/** Fail fast with actionable config errors before Gemini/ffmpeg work. */
export async function assertGoldDailyMediaEnv(env: Env): Promise<void> {
  const origin = env.SOCIAL_PUBLIC_FILES_ORIGIN ?? env.PUBLIC_FILES_ORIGIN;
  if (!origin) {
    throw new Error(
      'Set SOCIAL_PUBLIC_FILES_ORIGIN (or PUBLIC_FILES_ORIGIN) to your public API URL, e.g. https://api.thrwa.co',
    );
  }
  const geminiKey =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!geminiKey?.trim()) {
    throw new Error('Set GEMINI_API_KEY on the server for gold daily voiceover');
  }
  await ensureFfmpegAvailable();
}

/** Generate voice (Gemini) + 9:16 video with muxed audio; upload public URLs for social APIs. */
export async function generateGoldDailyMedia(args: {
  env: Env;
  vars: Record<string, string>;
  voiceInput: GoldVoiceoverInput;
}): Promise<GoldDailyMediaBundle> {
  await assertGoldDailyMediaEnv(args.env);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gold-daily-media-'));
  const voicePath = path.join(workDir, 'voice.wav');

  try {
    const { scriptText, durationSec } = await synthesizeGoldVoiceover(
      args.voiceInput,
      voicePath,
    );

    const rendered = await renderGoldShortVideo({
      env: args.env,
      vars: args.vars,
      outputDir: workDir,
      voicePath,
      minSeconds: Math.ceil(durationSec),
    });

    const finalVideoPath = rendered.videoWithVoicePath ?? rendered.videoPath;
    const png = await fs.readFile(rendered.pngPath);
    const videoBytes = await fs.readFile(finalVideoPath);

    const image = await writePublicSocialImage(args.env, png);
    const video = await writePublicSocialVideo(args.env, videoBytes);

    return {
      png,
      pngPublicUrl: image.publicUrl,
      videoPublicUrl: video.publicUrl,
      videoBytes,
      voiceScript: scriptText,
      seconds: rendered.seconds,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
