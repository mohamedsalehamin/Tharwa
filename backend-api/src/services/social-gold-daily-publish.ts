import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type {
  SocialPostChannel,
  SocialPostFormat,
  SocialPostStatus,
  SocialPostTemplate,
} from '@prisma/client';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { cairoDateKey } from './egx-trading-day.js';
import { generateGoldDailyMedia } from './gold-daily-media.js';
import { getMetaSocialConfig } from './meta-social-credentials.js';
import {
  publishFacebookReel,
  publishFacebookStoryPhoto,
  publishFacebookStoryVideo,
  publishInstagramReel,
  publishInstagramStoryPhoto,
  publishInstagramStoryVideo,
} from './meta-graph.js';
import {
  buildSocialContent,
  isStoryVideoDay,
  type PlatformCaptions,
  type SocialContentBundle,
} from './social-template-data.js';
import type { SocialTemplateKey } from './social-templates.js';
import { getYoutubeSocialConfig } from './youtube-social-credentials.js';
import { uploadYoutubeShort } from './youtube-upload.js';
import { getTiktokSocialConfig } from './tiktok-social-credentials.js';
import { uploadTiktokVideo } from './tiktok-upload.js';

export type SocialPublishResult = {
  template: SocialTemplateKey;
  results: {
    channel: SocialPostChannel;
    format: SocialPostFormat;
    status: SocialPostStatus;
    externalPostId: string | null;
    errorMessage: string | null;
  }[];
};

async function wasPublished(args: {
  day: string;
  template: SocialPostTemplate;
  channel: SocialPostChannel;
  format: SocialPostFormat;
}): Promise<boolean> {
  const row = await prisma.socialPostRun.findFirst({
    where: {
      cairoDateKey: args.day,
      template: args.template,
      channel: args.channel,
      format: args.format,
      status: 'published',
    },
  });
  return row != null;
}

async function recordRun(args: {
  template: SocialPostTemplate;
  channel: SocialPostChannel;
  format: SocialPostFormat;
  status: SocialPostStatus;
  caption: string | null;
  externalPostId: string | null;
  errorMessage: string | null;
  triggeredBy: string;
  day: string;
}): Promise<SocialPublishResult['results'][number]> {
  await prisma.socialPostRun.create({
    data: {
      template: args.template,
      channel: args.channel,
      format: args.format,
      status: args.status,
      caption: args.caption,
      externalPostId: args.externalPostId,
      errorMessage: args.errorMessage,
      triggeredBy: args.triggeredBy,
      cairoDateKey: args.day,
      postedAt: args.status === 'published' ? new Date() : null,
    },
  });
  return {
    channel: args.channel,
    format: args.format,
    status: args.status,
    externalPostId: args.externalPostId,
    errorMessage: args.errorMessage,
  };
}

async function latestRun(args: {
  day: string;
  template: SocialPostTemplate;
  channel: SocialPostChannel;
  format: SocialPostFormat;
}) {
  return prisma.socialPostRun.findFirst({
    where: {
      cairoDateKey: args.day,
      template: args.template,
      channel: args.channel,
      format: args.format,
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function shouldAttemptPublish(args: {
  template: SocialPostTemplate;
  channel: SocialPostChannel;
  format: SocialPostFormat;
  day: string;
  force: boolean;
  retryFailed: boolean;
}): Promise<{ attempt: boolean; skipReason?: string }> {
  if (args.force) return { attempt: true };
  if (await wasPublished(args)) {
    return { attempt: false, skipReason: 'already published today' };
  }
  if (args.retryFailed) {
    const last = await latestRun(args);
    if (last?.status === 'failed') return { attempt: true };
    return { attempt: false, skipReason: last ? 'no failed run to retry' : 'nothing failed yet' };
  }
  const last = await latestRun(args);
  if (last?.status === 'skipped') {
    return { attempt: false, skipReason: last.errorMessage ?? 'already published today' };
  }
  return { attempt: true };
}

async function tryPublish(args: {
  template: SocialPostTemplate;
  channel: SocialPostChannel;
  format: SocialPostFormat;
  caption: string | null;
  triggeredBy: string;
  day: string;
  force: boolean;
  retryFailed: boolean;
  channelsOnly?: SocialPostChannel[];
  fn: () => Promise<string>;
}): Promise<SocialPublishResult['results'][number] | null> {
  if (args.channelsOnly?.length && !args.channelsOnly.includes(args.channel)) {
    return null;
  }
  const gate = await shouldAttemptPublish(args);
  if (!gate.attempt) {
    return recordRun({
      ...args,
      status: 'skipped',
      externalPostId: null,
      errorMessage: gate.skipReason ?? 'skipped',
    });
  }
  try {
    const externalPostId = await args.fn();
    return recordRun({ ...args, status: 'published', externalPostId, errorMessage: null });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return recordRun({ ...args, status: 'failed', externalPostId: null, errorMessage });
  }
}

/** Generate video + voice and publish Reels/Shorts + alternating Stories for gold daily. */
export async function publishGoldDailyVideoBundle(args: {
  env: Env;
  redis: Redis;
  log: FastifyBaseLogger;
  triggeredBy: string;
  force?: boolean;
  retryFailed?: boolean;
  channelsOnly?: SocialPostChannel[];
}): Promise<SocialPublishResult | null> {
  const content = await buildSocialContent(args.env, args.redis, args.log, 'gold_daily');
  if (!content?.platformCaptions || !content.voiceInput) return null;

  const channelsOnly = args.channelsOnly;
  const wants = (channel: SocialPostChannel) =>
    !channelsOnly?.length || channelsOnly.includes(channel);

  const meta = await getMetaSocialConfig(args.env);
  const youtube = await getYoutubeSocialConfig(args.env);
  const tiktok = await getTiktokSocialConfig(args.env);

  const needsMeta = wants('instagram') || wants('facebook');
  const needsYoutube = wants('youtube');
  const needsTiktok = wants('tiktok');

  if (needsMeta && !meta) {
    throw new Error('Meta is not configured but was selected for publish');
  }
  if (needsYoutube && !youtube?.publishEnabled) {
    throw new Error('YouTube is not connected or publish is disabled');
  }
  if (needsTiktok && !tiktok?.publishEnabled) {
    throw new Error('TikTok is not connected or publish is disabled');
  }
  if (!needsMeta && !needsYoutube && !needsTiktok) {
    throw new Error('No platforms selected for publish');
  }
  if (!meta && !youtube?.publishEnabled && !tiktok?.publishEnabled) {
    throw new Error('Configure Meta, YouTube, and/or TikTok social integration first');
  }

  const day = cairoDateKey();
  const media = await generateGoldDailyMedia({
    env: args.env,
    vars: content.vars,
    voiceInput: content.voiceInput,
  });

  const captions = content.platformCaptions;
  const results: SocialPublishResult['results'] = [];
  const force = args.force ?? false;
  const retryFailed = args.retryFailed ?? false;
  const publishArgs = { channelsOnly, force, retryFailed, triggeredBy: args.triggeredBy, day };

  function pushResult(result: SocialPublishResult['results'][number] | null) {
    if (result) results.push(result);
  }

  if (meta?.publishInstagram && wants('instagram')) {
    pushResult(
      await tryPublish({
        template: 'gold_daily',
        channel: 'instagram',
        format: 'reel',
        caption: captions.igReel,
        ...publishArgs,
        fn: () =>
          publishInstagramReel({
            config: meta,
            caption: captions.igReel,
            videoUrl: media.videoPublicUrl,
          }),
      }),
    );

    const storyVideo = isStoryVideoDay(day);
    pushResult(
      await tryPublish({
        template: 'gold_daily',
        channel: 'instagram',
        format: 'story',
        caption: captions.storyOverlay,
        ...publishArgs,
        fn: () =>
          storyVideo
            ? publishInstagramStoryVideo({ config: meta, videoUrl: media.videoPublicUrl })
            : publishInstagramStoryPhoto({ config: meta, imageUrl: media.pngPublicUrl }),
      }),
    );
  }

  if (meta?.publishFacebook && wants('facebook')) {
    pushResult(
      await tryPublish({
        template: 'gold_daily',
        channel: 'facebook',
        format: 'reel',
        caption: captions.fbReel,
        ...publishArgs,
        fn: () =>
          publishFacebookReel({
            config: meta,
            caption: captions.fbReel,
            videoUrl: media.videoPublicUrl,
          }),
      }),
    );

    const storyVideo = isStoryVideoDay(day);
    pushResult(
      await tryPublish({
        template: 'gold_daily',
        channel: 'facebook',
        format: 'story',
        caption: captions.storyOverlay,
        ...publishArgs,
        fn: () =>
          storyVideo
            ? publishFacebookStoryVideo({ config: meta, videoUrl: media.videoPublicUrl })
            : publishFacebookStoryPhoto({ config: meta, imageUrl: media.pngPublicUrl }),
      }),
    );
  }

  if (youtube?.publishEnabled && wants('youtube')) {
    pushResult(
      await tryPublish({
        template: 'gold_daily',
        channel: 'youtube',
        format: 'reel',
        caption: captions.ytDescription,
        ...publishArgs,
        fn: () =>
          uploadYoutubeShort({
            env: args.env,
            config: youtube,
            title: captions.ytTitle,
            description: captions.ytDescription,
            videoBytes: media.videoBytes,
          }),
      }),
    );
  }

  if (tiktok?.publishEnabled && wants('tiktok')) {
    pushResult(
      await tryPublish({
        template: 'gold_daily',
        channel: 'tiktok',
        format: 'reel',
        caption: captions.ttCaption,
        ...publishArgs,
        fn: () =>
          uploadTiktokVideo({
            env: args.env,
            config: tiktok,
            title: captions.ttCaption,
            videoBytes: media.videoBytes,
          }),
      }),
    );
  }

  if (results.length === 0) return null;
  return { template: 'gold_daily', results };
}

export type { PlatformCaptions, SocialContentBundle };
