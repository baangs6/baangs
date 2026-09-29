import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateHashRoute } from '../src/utils/migrateHashRoute.js';

for (const [input, expected] of [
  ['/#/complaint', '/complaint'],
  ['/#/jobs/JOB-123', '/jobs/JOB-123'],
  ['/?source=message#/track?phone=123', '/track?phone=123&source=message'],
  ['/complaint', null],
  ['/complaint#contact', null],
  ['/#//example.com', null],
]) {
  test(input, () => {
    let result = null;
    const browser = {
      location: new URL(input, 'https://baangs.site'),
      history: { state: null, replaceState: (_state, _title, url) => { result = url; } },
    };
    migrateHashRoute(browser);
    assert.equal(result, expected);
  });
}
