const test = require('node:test');
const assert = require('node:assert/strict');

const { run } = require('../src/index');

test('run returns ok', () => {
  assert.equal(run(), 'ok');
});
