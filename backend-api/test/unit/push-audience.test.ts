import { describe, expect, it } from 'vitest';
import { pushAudienceWhere } from '../../src/services/push-audience.js';

describe('pushAudienceWhere', () => {
  it('targets all active devices', () => {
    expect(pushAudienceWhere('all')).toEqual({ disabledAt: null });
  });

  it('targets registered users only', () => {
    expect(pushAudienceWhere('registered')).toEqual({
      disabledAt: null,
      consumerUserId: { not: null },
    });
  });

  it('filters by platform', () => {
    expect(pushAudienceWhere('ios')).toEqual({ disabledAt: null, platform: 'ios' });
    expect(pushAudienceWhere('android')).toEqual({ disabledAt: null, platform: 'android' });
  });
});
