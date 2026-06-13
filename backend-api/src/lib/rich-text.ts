/** Strip HTML for word-count / reading-time (not a security sanitizer). */
export function stripHtmlForText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote',
  'hr',
]);

/** Minimal allowlist sanitizer for admin-authored learn HTML. */
export function sanitizeLearnHtml(raw: string): string {
  const input = raw.trim();
  if (!input) return '';

  // Fast path: plain text without tags
  if (!input.includes('<')) return input;

  let out = '';
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(input)) !== null) {
    const text = match[3];
    if (text != null) {
      out += text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
      continue;
    }

    const tag = match[1]!.toLowerCase();
    const attrs = match[2] ?? '';
    const closing = match[0].startsWith('</');

    if (!ALLOWED_TAGS.has(tag)) continue;

    if (closing) {
      out += `</${tag}>`;
      continue;
    }

    if (tag === 'br' || tag === 'hr') {
      out += `<${tag}>`;
      continue;
    }

    if (tag === 'a') {
      const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '').trim();
      if (!/^https?:\/\//i.test(href)) {
        out += '<a>';
      } else {
        out += `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">`;
      }
      continue;
    }

    out += `<${tag}>`;
  }

  return out.trim();
}
