import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { SocialPostChannel, SocialPostStatus, SocialPostTemplate } from '@prisma/client';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { cairoDateKey } from './egx-trading-day.js';
import {
  getMetaSocialConfig,
  type MetaSocialConfig,
} from './meta-social-credentials.js';
import { publishFacebookPhoto, publishInstagramPhoto } from './meta-graph.js';
import {
  buildSocialContent,
  markGoldAlertSent,
  wasGoldAlertSentToday,
  type SocialContentBundle,
} from './social-template-data.js';
import { renderSvgToPng, writePublicSocialImage } from './social-image.js';
import {
  fillTemplate,
  loadSocialTemplateSvg,
  type SocialTemplateKey,
} from './social-templates.js';

export type SocialPreviewResult = {
  template: SocialTemplateKey;
  caption: string;
  svg: string;
  pngBase64: string | null;
  pngError: string | null;
};

export type SocialPublishResult = {
  template: SocialTemplateKey;
  results: {
    channel: SocialPostChannel;
    status: SocialPostStatus;
    externalPostId: string | null;
    errorMessage: string | null;
  }[];
};

export async function previewSocialPost(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  template: SocialTemplateKey,
): Promise<SocialPreviewResult | null> {
  const content = await buildSocialContent(env, redis, log, template);
  if (!content) return null;

  const svgTemplate = await loadSocialTemplateSvg(env, template);
  const svg = fillTemplate(svgTemplate, content.vars);

  let pngBase64: string | null = null;
  let pngError: string | null = null;
  try {
    pngBase64 = renderSvgToPng(svg, env).toString('base64');
  } catch (e) {
    pngError = e instanceof Error ? e.message : String(e);
  }

  return {
    template,
    caption: content.caption,
    svg,
    pngBase64,
    pngError,
  };
}

export async function publishSocialPost(args: {
  env: Env;
  redis: Redis;
  log: FastifyBaseLogger;
  template: SocialTemplateKey;
  triggeredBy: string;
  force?: boolean;
}): Promise<SocialPublishResult | null> {
  const config = await getMetaSocialConfig(args.env);
  if (!config) {
    throw new Error('Meta social integration is not configured');
  }

  const content = await buildSocialContent(args.env, args.redis, args.log, args.template);
  if (!content) return null;

  const day = cairoDateKey();
  if (args.template === 'gold_alert' && !args.force) {
    if (await wasGoldAlertSentToday(args.redis, day)) return null;
  }

  if (!args.force) {
    const already = await prisma.socialPostRun.findFirst({
      where: {
        cairoDateKey: day,
        template: args.template as SocialPostTemplate,
        status: 'published',
      },
    });
    if (already && args.template !== 'gold_alert') return null;
  }

  const svgTemplate = await loadSocialTemplateSvg(args.env, args.template);
  const svg = fillTemplate(svgTemplate, content.vars);
  const png = renderSvgToPng(svg, args.env);
  const image = await writePublicSocialImage(args.env, png);

  const results: SocialPublishResult['results'] = [];

  if (config.publishFacebook) {
    results.push(
      await publishToChannel({
        channel: 'facebook',
        config,
        content,
        png,
        imageUrl: image.publicUrl,
        template: args.template,
        triggeredBy: args.triggeredBy,
        day,
      }),
    );
  }

  if (config.publishInstagram) {
    results.push(
      await publishToChannel({
        channel: 'instagram',
        config,
        content,
        png,
        imageUrl: image.publicUrl,
        template: args.template,
        triggeredBy: args.triggeredBy,
        day,
      }),
    );
  }

  if (args.template === 'gold_alert' && results.some((r) => r.status === 'published')) {
    await markGoldAlertSent(args.redis, day);
  }

  return { template: args.template, results };
}

async function publishToChannel(args: {
  channel: SocialPostChannel;
  config: MetaSocialConfig;
  content: SocialContentBundle;
  png: Buffer;
  imageUrl: string;
  template: SocialTemplateKey;
  triggeredBy: string;
  day: string;
}): Promise<SocialPublishResult['results'][number]> {
  try {
    const externalPostId =
      args.channel === 'facebook'
        ? await publishFacebookPhoto({
            config: args.config,
            caption: args.content.caption,
            png: args.png,
          })
        : await publishInstagramPhoto({
            config: args.config,
            caption: args.content.caption,
            imageUrl: args.imageUrl,
          });

    await prisma.socialPostRun.create({
      data: {
        template: args.template,
        channel: args.channel,
        status: 'published',
        caption: args.content.caption,
        externalPostId,
        triggeredBy: args.triggeredBy,
        cairoDateKey: args.day,
        postedAt: new Date(),
      },
    });

    return {
      channel: args.channel,
      status: 'published',
      externalPostId,
      errorMessage: null,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await prisma.socialPostRun.create({
      data: {
        template: args.template,
        channel: args.channel,
        status: 'failed',
        caption: args.content.caption,
        errorMessage,
        triggeredBy: args.triggeredBy,
        cairoDateKey: args.day,
      },
    });
    return {
      channel: args.channel,
      status: 'failed',
      externalPostId: null,
      errorMessage,
    };
  }
}

export async function listSocialPostRuns(limit = 50, offset = 0) {
  const [items, total] = await Promise.all([
    prisma.socialPostRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.socialPostRun.count(),
  ]);
  return { items, total, limit, offset };
}

export function cairoHourMinute(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

export function isPastSendTime(
  hour: number,
  minute: number,
  targetHour: number,
  targetMinute: number,
): boolean {
  if (hour > targetHour) return true;
  if (hour === targetHour && minute >= targetMinute) return true;
  return false;
}
