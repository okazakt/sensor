'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { versionForDate } = require('./update-js-version.cjs');

test('日本時間で採番し、日付・月・年の繰り上がりを反映する', () => {
  const cases = [
    ['2026-10-04T08:22:00Z', 'v0.26.101.041722'],
    ['2026-10-04T15:00:00Z', 'v0.26.101.050000'],
    ['2026-10-31T15:00:00Z', 'v0.26.111.010000'],
    ['2026-12-31T15:00:00Z', 'v0.27.11.010000']
  ];
  for (const timeZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const original = process.env.TZ;
    try {
      process.env.TZ = timeZone;
      for (const [instant, expected] of cases) {
        assert.equal(versionForDate(new Date(instant)), expected);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  }
});
