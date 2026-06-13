import { describe, expect, it } from 'vitest';
import {
  parseCalendarLabsEgxHolidayHtml,
} from '../../src/services/connectors/calendarlabs-egx-holidays.js';

const FIXTURE_2026 = `
<table class="hlist_tab"><thead><tr><th>DAY</th><th>DATE</th><th>HOLIDAY</th><th>COMMENTS</th></tr></thead><tbody>
<tr class="r0"><td><span class='pc'>Wednesday</span></td><td class="dt_nowrap"><span class='pc'>Jan 07, 2026</span></td><td><a href="/holidays/egypt/coptic-christmas.php">Coptic Christmas</a></td><td>Full Day Off</td></tr>
<tr class="r1"><td><span class='pc'>Tuesday</span></td><td class="dt_nowrap"><span class='pc'>Jun 16, 2026</span></td><td><a href="/holidays/india/muharram.php">Muharram</a></td><td>Full Day Off</td></tr>
</tbody></table>`;

describe('parseCalendarLabsEgxHolidayHtml', () => {
  it('parses full-day holidays from CalendarLabs HTML', () => {
    const rows = parseCalendarLabsEgxHolidayHtml(FIXTURE_2026);
    expect(rows).toEqual([
      { dateKey: '2026-01-07', nameEn: 'Coptic Christmas' },
      { dateKey: '2026-06-16', nameEn: 'Muharram' },
    ]);
  });

  it('ignores partial closure rows', () => {
    const html = FIXTURE_2026.replaceAll('Full Day Off', 'Early Close');
    expect(parseCalendarLabsEgxHolidayHtml(html)).toEqual([]);
  });
});
