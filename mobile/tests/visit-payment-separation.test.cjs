const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('visit updates have no payment input while billing and historical receipts remain', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/screens/JobDetailScreen.js'), 'utf8');
  assert.doesNotMatch(source, /updateForm\.collected_amount/);
  assert.doesNotMatch(source, /Amount Collected \(Rs\)/);
  assert.match(source, /collected_amount: parseFloat\(billingForm\.collected_amount\)/);
  assert.match(source, /\['Collected Amount \(Rs\)', 'collected_amount'\]/);
  assert.match(source, /Number\(update\.collected_amount\)/);
});
