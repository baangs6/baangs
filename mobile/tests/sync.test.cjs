const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function load(relative, mocks = {}, globals = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => name in mocks ? mocks[name] : require(name),
    console, process, setInterval, clearInterval, ...globals }, { filename });
  return module.exports;
}

test('notification baseline remembers IDs and only alerts new unread records', () => {
  const state = load('src/utils/notificationState.js');
  const rows = [{ notification_id: 'new' }, { notification_id: 'old' }, { notification_id: 'read', is_read: true }];
  assert.deepEqual(Array.from(state.unseenNotifications(rows, ['old']), row => row.notification_id), ['new']);
  assert.equal(state.rememberNotifications(Array.from({ length: 600 }, (_, index) => ({ notification_id: String(index) })), []).length, 500);
});

test('visible screen refreshes on resume and data changes, serializes requests and cleans up', async () => {
  const effects = [];
  const state = { currentState: 'active', addEventListener: (_, fn) => { state.listener = fn; return { remove: () => { state.removed = true; } }; } };
  let changed;
  let tick;
  let cleared = false;
  let calls = 0;
  let release;
  const hook = load('src/hooks/useLiveRefresh.js', {
    react: { useEffect: fn => effects.push(fn), useRef: value => ({ current: value }) },
    'react-native': { AppState: state }, '@react-navigation/native': { useIsFocused: () => true },
    '../utils/appEvents': { subscribe: (_, fn) => { changed = fn; return () => { changed = null; }; } },
  }, { setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { cleared = true; } });
  hook.default(async () => { calls++; await new Promise(resolve => { release = resolve; }); });
  const cleanup = effects[0]();
  assert.equal(calls, 1);
  changed();
  tick();
  assert.equal(calls, 1);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  release();
  await new Promise(resolve => setImmediate(resolve));
  state.currentState = 'background';
  tick();
  assert.equal(calls, 2);
  state.currentState = 'active';
  state.listener('active');
  assert.equal(calls, 3);
  cleanup();
  release();
  assert.ok(cleared && state.removed && !changed);
});

function mockApi() {
  const hooks = {};
  const values = new Map([['token', 'current'], ['user', '{}']]);
  const events = [];
  const api = { interceptors: { request: { use: fn => { hooks.request = fn; } }, response: { use: (ok, error) => { hooks.ok = ok; hooks.error = error; } } } };
  const exported = load('src/api/index.js', {
    axios: { create: () => api }, 'react-native': { Platform: { OS: 'android' } },
    '../utils/storage': { getItem: async key => values.get(key), multiRemove: async keys => keys.forEach(key => values.delete(key)) },
    '../utils/appEvents': { publish: (...args) => events.push(args) },
  });
  return { api, hooks, values, events, exported };
}

test('jobs paginate past 200 records and deduplicate', async () => {
  const { api, exported } = mockApi();
  const offsets = [];
  api.get = async (_, config) => {
    offsets.push(config.params.skip);
    return { data: config.params.skip === 0 ? Array.from({ length: 200 }, (_, index) => ({ job_id: String(index) })) : [{ job_id: '200' }, { job_id: '199' }] };
  };
  const result = await exported.jobsApi.listAll();
  assert.equal(result.data.length, 201);
  assert.deepEqual(offsets, [0, 200]);
});

test('401 expires current session but does not invalidate a newer login', async () => {
  const { hooks, values, events } = mockApi();
  await assert.rejects(hooks.error({ response: { status: 401 }, config: { headers: { Authorization: 'Bearer old' } } }));
  assert.equal(values.get('token'), 'current');
  await assert.rejects(hooks.error({ response: { status: 401 }, config: { headers: { Authorization: 'Bearer current' } } }));
  assert.equal(values.has('token'), false);
  assert.equal(events[0][0], 'sessionExpired');
});

test('GET removes stale authorization and successful changes trigger refresh', async () => {
  const { hooks, values, events } = mockApi();
  values.clear();
  const request = await hooks.request({ method: 'get', headers: { Authorization: 'Bearer old' } });
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(request.headers['Cache-Control'], 'no-cache');
  hooks.ok({ config: { method: 'post', url: '/updates/' } });
  hooks.ok({ config: { method: 'get', url: '/jobs/' } });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'dataChanged');
});

test('phone alerts baseline old records, show new records once and expose missing push setup', async () => {
  const values = new Map();
  const scheduled = [];
  const notifications = {
    AndroidImportance: { HIGH: 4 }, AndroidNotificationVisibility: { PUBLIC: 1 },
    setNotificationChannelAsync: async () => {}, getPermissionsAsync: async () => ({ granted: true }),
    getPresentedNotificationsAsync: async () => [], scheduleNotificationAsync: async request => scheduled.push(request),
  };
  const module = load('src/utils/phoneNotifications.js', {
    'react-native': { Platform: { OS: 'android' } }, 'expo-notifications': notifications,
    'expo-constants': { expoConfig: {} },
    './storage': { getItem: async key => values.get(key), setItem: async (key, value) => values.set(key, value) },
    '../api': { notificationsApi: {} }, './appEvents': { publish: () => {} },
    './notificationState': load('src/utils/notificationState.js'),
  });
  assert.equal(await module.configurePhoneNotifications(), false);
  assert.match(values.get('phoneNotificationStatus'), /Firebase/);
  await module.showNewPhoneAlerts('U', [{ notification_id: 'old' }]);
  assert.equal(scheduled.length, 0);
  const rows = [{ notification_id: 'new', title: 'Job', message: 'Assigned', meta: { job_id: 'J' } }, { notification_id: 'old' }];
  await module.showNewPhoneAlerts('U', rows);
  await module.showNewPhoneAlerts('U', rows);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].content.data.job_id, 'J');
  assert.equal(scheduled[0].trigger.channelId, module.PHONE_CHANNEL);
});
