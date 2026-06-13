import { describe, expect, it } from 'vitest';
import {
  normalizeDisplayName,
  normalizePhone,
  toConsumerUserPublic,
} from '../../src/services/consumer-user.js';

describe('consumer-user', () => {
  it('normalizes display name', () => {
    expect(normalizeDisplayName('  Ahmed   Ali  ')).toBe('Ahmed Ali');
  });

  it('normalizes phone to digits', () => {
    expect(normalizePhone('0101 234 5678')).toBe('01012345678');
    expect(normalizePhone('+20 101 234 5678')).toBe('+201012345678');
  });

  it('rejects invalid phone', () => {
    expect(() => normalizePhone('123')).toThrow('Invalid phone number');
  });

  it('maps public user shape', () => {
    expect(
      toConsumerUserPublic({
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Ali',
        phone: '01012345678',
      }),
    ).toEqual({
      id: 'u1',
      email: 'a@b.com',
      name: 'Ali',
      phone: '01012345678',
    });
  });
});
