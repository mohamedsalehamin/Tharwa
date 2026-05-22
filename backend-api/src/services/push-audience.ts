import type { Prisma, PushPlatform } from '@prisma/client';

export type PushBroadcastAudience = 'all' | 'registered' | 'ios' | 'android';

export function pushAudienceWhere(audience: PushBroadcastAudience): Prisma.PushDeviceWhereInput {
  const active: Prisma.PushDeviceWhereInput = { disabledAt: null };
  switch (audience) {
    case 'all':
      return active;
    case 'registered':
      return { ...active, consumerUserId: { not: null } };
    case 'ios':
      return { ...active, platform: 'ios' satisfies PushPlatform };
    case 'android':
      return { ...active, platform: 'android' satisfies PushPlatform };
    default: {
      const _exhaustive: never = audience;
      return _exhaustive;
    }
  }
}

export const PUSH_AUDIENCES: PushBroadcastAudience[] = ['all', 'registered', 'ios', 'android'];
