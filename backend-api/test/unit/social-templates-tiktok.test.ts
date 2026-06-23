import { describe, expect, it } from 'vitest';
import { stripSvgForTiktokDirectPost } from '../../src/services/social-templates.js';

describe('stripSvgForTiktokDirectPost', () => {
  it('removes logo, CTA block, and branded footer hashtag', () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <image href="tharwa-logo.png" x="72" y="56" width="80" height="80"/>
  <text>prices</text>
  <!-- CTA -->
  <g transform="translate(72, 880)">
    <rect width="936" height="88"/>
  </g>
  <text x="540" y="1010">#&#x627;&#x633;&#x639;&#x627;&#x631;_&#x627;&#x644;&#x630;&#x647;&#x628;_&#x645;&#x646;_&#x62B;&#x631;&#x648;&#x629;</text>
</svg>`;

    const out = stripSvgForTiktokDirectPost(svg);
    expect(out).not.toContain('tharwa-logo');
    expect(out).not.toContain('translate(72, 880)');
    expect(out).not.toContain('#&#x627;&#x633;&#x639;&#x627;&#x631;');
    expect(out).toContain('prices');
  });
});
