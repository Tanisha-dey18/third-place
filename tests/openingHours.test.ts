import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpeningHours } from '../src/lib/places/openingHours';
import { isOpenAt } from '../src/lib/geo';
import { zonedDayTime } from '../src/lib/time';

test('real Kolkata formats are interpreted', () => {
  const a = parseOpeningHours('Mo-Su 08:00-00:30');
  assert.equal(a.status, 'parsed');
  assert.equal(a.schedule!.length, 7);
  assert.equal(isOpenAt(a.schedule, 2, '23:59'), true);
  assert.equal(isOpenAt(a.schedule, 3, '00:15'), true, 'overnight spill into the next day');
  assert.equal(isOpenAt(a.schedule, 3, '01:00'), false);
  assert.equal(isOpenAt(a.schedule, 3, '07:59'), false);

  const b = parseOpeningHours('Mo-Su 12:00-4:00'); // single-digit hour, overnight
  assert.equal(b.status, 'parsed');
  assert.equal(isOpenAt(b.schedule, 6, '03:30'), true);
  assert.equal(isOpenAt(b.schedule, 6, '04:30'), false);

  const c = parseOpeningHours('Mo-Th 10:00-01:00; Fr-Su 10:00-02:00');
  assert.equal(c.status, 'parsed');
  assert.equal(isOpenAt(c.schedule, 6, '01:30'), true, 'Friday night slot covers early Saturday');
  assert.equal(isOpenAt(c.schedule, 4, '01:30'), false, 'Wednesday night slot ends at 01:00');

  const d = parseOpeningHours('16:00-23:30'); // no day selector = every day
  assert.equal(d.schedule!.length, 7);
  const e = parseOpeningHours('10:30-24:00');
  assert.equal(isOpenAt(e.schedule, 1, '23:59'), true);
});

test('off days, later rules overriding earlier ones, wrap-around ranges, split shifts', () => {
  const r = parseOpeningHours('Mo-Su 09:00-21:00; Tu off');
  assert.equal(isOpenAt(r.schedule, 2, '12:00'), false);
  assert.equal(isOpenAt(r.schedule, 1, '12:00'), true);
  const w = parseOpeningHours('Sa-Mo 10:00-18:00');
  assert.deepEqual([...new Set(w.schedule!.map((s) => s.day))].sort(), [0, 1, 6]);
  const split = parseOpeningHours('Mo-Fr 08:00-12:00,14:00-22:00');
  assert.equal(isOpenAt(split.schedule, 1, '13:00'), false);
  assert.equal(isOpenAt(split.schedule, 1, '15:00'), true);
  assert.equal(isOpenAt(split.schedule, 0, '15:00'), false, 'days never mentioned are closed');
});

test('24/7 and public-holiday rules', () => {
  const a = parseOpeningHours('24/7');
  assert.equal(isOpenAt(a.schedule, 0, '03:00'), true);
  const ph = parseOpeningHours('Mo-Sa 10:00-22:00; PH off');
  assert.equal(ph.status, 'parsed');
  assert.match(ph.note ?? '', /holiday/i);
});

test('unknown or malformed schedules never claim open or closed', () => {
  for (const raw of [
    'Mo-Fr sunrise-sunset',
    'Jan-Mar Mo-Fr 09:00-17:00',
    'Mo-Fr 09:00-17:00 "by appointment"',
    'Mo-Fr 09:00+',
    'Mo-Fr 9-5',
    'whenever',
    'Mo-Fr 25:00-26:00',
    'Mo-Fr 10:00-10:00',
    'Xx 10:00-12:00',
  ]) {
    const p = parseOpeningHours(raw);
    assert.equal(p.status, 'unsupported', raw);
    assert.equal(p.schedule, null);
    assert.equal(isOpenAt(p.schedule, 1, '12:00'), null, raw);
    assert.equal(p.raw, raw, 'raw text is kept for display');
  }
  assert.equal(parseOpeningHours(undefined).status, 'missing');
  assert.equal(parseOpeningHours('   ').status, 'missing');
  assert.equal(isOpenAt(null, 1, '12:00'), null);
});

test('Kolkata timezone: day and time come from Asia/Kolkata, not the device', () => {
  // 2026-10-14T19:00:00Z is Thursday 00:30 in Kolkata (UTC+5:30) but still Wednesday in UTC.
  const at = new Date('2026-10-14T19:00:00Z');
  assert.deepEqual(zonedDayTime('Asia/Kolkata', at), { day: 4, time: '00:30' });
  assert.deepEqual(zonedDayTime('UTC', at), { day: 3, time: '19:00' });
  const sched = parseOpeningHours('Mo-Su 08:00-00:00').schedule;
  const k = zonedDayTime('Asia/Kolkata', at);
  assert.equal(isOpenAt(sched, k.day, k.time), false, 'closed at 00:30 IST even though it is 19:00 UTC');
});
