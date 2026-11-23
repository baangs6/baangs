const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/screens/JobCreateScreen.js'), 'utf8');

test('customer search queries the API rather than only the first page', () => {
  assert.match(source, /customersApi\.list\(\{ search, limit: 20 \}\)/);
  assert.match(source, /\[customerSearch, retry\]/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.doesNotMatch(source, /\$\{form.customer_name\} \$\{form.phone_number\}/);
});

test('literal customer search safely escapes regex characters', () => {
  const expression = source.match(/const search = (query\.replace\([^\n]+);/)[1];
  const escape = new Function('query', `return ${expression}`);
  for (const query of ['A (Home)', '+9198', 'A.B', '[Shop]', 'a\\b']) {
    const result = new RegExp(escape(query), 'i');
    assert.ok(result.test(query));
  }
  assert.equal(new RegExp(escape('A.B')).test('AXB'), false);
});

test('selection fills customer details and clears stale site values', () => {
  const body = source.split('const selectCustomer = (c) => {')[1].split('\n  const submit')[0];
  let form = { location: 'Old site', map_location: 'Old map', customer_name: '', phone_number: '' };
  const setForm = update => { form = update(form); };
  const select = new Function('c', 'setForm', 'setSelectedCustomerId', 'setCustomerSearch', body.replace(/\};\s*$/, ''));
  select({ customer_id: 'C-99', customer_name: 'Customer', phone_number: '9000000000', location: 'New site', nickname: 'Office' }, setForm, () => {}, () => {});
  assert.equal(form.location, 'New site');
  assert.equal(form.map_location, '');
  assert.equal(form.customer_nickname, 'Office');
  assert.equal(form.phone_number, '9000000000');
});
