import { describe, expect, it } from 'vitest';
import {
  computeReadingTimeMinutes,
  parseYoutubeVideoId,
  wordCount,
} from '../../src/services/learn-content.js';
import { parseYoutubePlaylistId } from '../../src/services/youtube-playlist.js';

describe('computeReadingTimeMinutes', () => {
  it('returns at least 1 minute', () => {
    expect(computeReadingTimeMinutes('hello', 'world')).toBe(1);
  });

  it('scales with word count from HTML', () => {
    const html = `<p>${Array.from({ length: 400 }, () => 'word').join(' ')}</p>`;
    expect(computeReadingTimeMinutes(html, html)).toBe(2);
  });
});

describe('wordCount', () => {
  it('counts whitespace-separated tokens', () => {
    expect(wordCount('  one two   three ')).toBe(3);
  });
});

describe('parseYoutubeVideoId', () => {
  it('accepts raw video id', () => {
    expect(parseYoutubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses watch URL', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses youtu.be URL', () => {
    expect(parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('parseYoutubePlaylistId', () => {
  it('parses playlist query param', () => {
    expect(parseYoutubePlaylistId('https://www.youtube.com/playlist?list=PLabc123xyz')).toBe(
      'PLabc123xyz',
    );
  });

  it('parses watch URL with list param', () => {
    expect(
      parseYoutubePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest1234567'),
    ).toBe('PLtest1234567');
  });

  it('accepts raw playlist id', () => {
    expect(parseYoutubePlaylistId('PLtest1234567890')).toBe('PLtest1234567890');
  });
});
