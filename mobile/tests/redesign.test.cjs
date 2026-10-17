const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const preset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
test('all mobile screens and shared components compile for Expo', () => {
  for (const file of [path.join(root, 'App.js'), ...files(path.join(root, 'src')).filter(file => file.endsWith('.js'))]) {
    assert.ok(babel.transformFileSync(file, { babelrc: false, configFile: false, presets: [preset] }).code, file);
  }
});
test('Android and Expo versions agree and update the previous APK', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'))).expo;
  const nativePath = path.join(root, 'android/app/build.gradle');
  if (fs.existsSync(nativePath)) {
    const native = fs.readFileSync(nativePath, 'utf8');
    assert.match(native, new RegExp(`versionCode ${config.android.versionCode}\\b`));
    assert.ok(native.includes(`versionName "${config.version}"`));
  }
  assert.ok(config.android.versionCode > 14);
  assert.equal(config.android.package, 'com.anonymous.mobile');
});
