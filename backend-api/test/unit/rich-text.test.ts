import { describe, expect, it } from 'vitest';
import { sanitizeLearnHtml, stripHtmlForText } from '../../src/lib/rich-text.js';

describe('stripHtmlForText', () => {
  it('removes tags and counts words from plain text', () => {
    expect(stripHtmlForText('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });
});

describe('sanitizeLearnHtml', () => {
  it('keeps allowed formatting tags', () => {
    const html = '<p>Hello <strong>world</strong></p><script>alert(1)</script>';
    expect(sanitizeLearnHtml(html)).toContain('<p>Hello <strong>world</strong></p>');
    expect(sanitizeLearnHtml(html)).not.toContain('script');
  });

  it('allows safe links only', () => {
    expect(sanitizeLearnHtml('<a href="https://example.com">link</a>')).toContain('https://example.com');
    expect(sanitizeLearnHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('passes through plain text', () => {
    expect(sanitizeLearnHtml('Plain text')).toBe('Plain text');
  });
});
