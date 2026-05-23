import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DISCLAIMER_COMBINED } from '../../i18n/disclaimers.js';
import { AppError, sendError } from '../../lib/errors.js';
import {
  defaultCalendarRange,
  listCorporateCalendarByDays,
  listCorporateCalendarDates,
  parseCalendarDateParam,
} from '../../services/corporate-calendar.js';

const datesQuery = z.object({
  horizonDays: z.coerce.number().int().min(1).max(90).default(14),
});

const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join('; ');
}

/** EGX corporate calendar (Mubasher AMR, consumer-visible symbols). */
export const v1CalendarRoutes: FastifyPluginAsync = async (app) => {
  app.get('/calendar/egx/dates', async (req, reply) => {
    try {
      const parsed = datesQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { dates, fetchedAt } = await listCorporateCalendarDates(parsed.data.horizonDays);
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        fetchedAt,
        dates,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/calendar/egx', async (req, reply) => {
    try {
      const parsed = rangeQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const defaults = defaultCalendarRange();
      const from = parseCalendarDateParam(parsed.data.from, defaults.from);
      const to = parseCalendarDateParam(parsed.data.to, defaults.to);
      if (from > to) {
        throw new AppError('VALIDATION', '`from` must be on or before `to`', 400);
      }

      const { days, fetchedAt } = await listCorporateCalendarByDays(from, to);
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        fetchedAt,
        days,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
