import { describe, expect, it } from 'vitest';
import { extractTmeWidgetMessages } from '../../src/services/connectors/telegram-egypt-metals.js';

const SAMPLE_HTML = `
<div class="tgme_widget_message_wrap js-widget_message_wrap">
  <div class="tgme_widget_message js-widget_message" data-post="goldprice10000/100">
    <div class="tgme_widget_message_bubble">
      <div class="tgme_widget_message_text js-message_text" dir="auto">old post</div>
    </div>
    <div class="tgme_widget_message_footer">
      <time datetime="2025-01-01T10:00:00+00:00" class="time">Jan 1</time>
    </div>
  </div>
</div>
<div class="tgme_widget_message_wrap js-widget_message_wrap">
  <div class="tgme_widget_message js-widget_message" data-post="goldprice10000/101">
    <div class="tgme_widget_message_bubble">
      <div class="tgme_widget_message_text js-message_text" dir="auto">📌 عيار_21_ 6815ج</div>
    </div>
    <div class="tgme_widget_message_footer">
      <time datetime="2025-01-02T12:00:00+00:00" class="time">Jan 2</time>
    </div>
  </div>
</div>
`;

describe('extractTmeWidgetMessages', () => {
  it('extracts message id, text, and posted time from t.me/s HTML', () => {
    const messages = extractTmeWidgetMessages(SAMPLE_HTML);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.messageId).toBe(100);
    expect(messages[0]!.text).toContain('old post');
    expect(messages[0]!.postedAt.toISOString()).toBe('2025-01-01T10:00:00.000Z');
    expect(messages[1]!.messageId).toBe(101);
    expect(messages[1]!.text).toContain('6815');
  });
});
