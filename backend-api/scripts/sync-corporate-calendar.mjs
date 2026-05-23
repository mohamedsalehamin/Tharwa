#!/usr/bin/env node
import { syncCorporateCalendarFromMubasher } from '../dist/services/corporate-calendar-sync.js';

const result = await syncCorporateCalendarFromMubasher(3);
console.log(result);
process.exit(result.success ? 0 : 1);
