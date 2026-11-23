const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('direct job entry points preserve the Jobs list as the initial screen', () => {
  const root = path.resolve(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  assert.match(app, /<Stack.Navigator\s+initialRouteName="JobsList"/);
  for (const file of ['App.js', 'src/screens/DashboardScreen.js', 'src/screens/NotificationsScreen.js', 'src/screens/LearningLogScreen.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const entries = [...source.matchAll(/screen: 'JobDetail',([^}]+)/g)];
    assert.ok(entries.length, `${file}: expected a direct job entry`);
    for (const entry of entries) assert.match(entry[1], /initial: false/, `${file}: direct entry must retain initial route`);
  }
});

test('Jobs stack can go back from job details to the list', async () => {
  const { StackRouter } = await import('@react-navigation/routers');
  const router = StackRouter({ initialRouteName: 'JobsList' });
  const options = { routeNames: ['JobsList', 'JobDetail', 'JobCreate'], routeParamList: {}, routeGetIdList: {} };
  const initial = router.getInitialState(options);
  const detail = router.getStateForAction(initial, { type: 'NAVIGATE', payload: { name: 'JobDetail', params: { jobId: 'JOB-TEST' } } }, options);
  assert.equal(detail.routes[detail.index].name, 'JobDetail');
  const back = router.getStateForAction(detail, { type: 'GO_BACK' }, options);
  assert.equal(back.routes[back.index].name, 'JobsList');
});
