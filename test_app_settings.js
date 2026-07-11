const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  loadAppSettings,
  saveAppSettings,
  settingsPath,
  updateAppSetting,
} = require('./app_settings');

test('app settings default to backup enabled when missing empty or broken', async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'app-settings-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  assert.deepEqual(await loadAppSettings(directory), { backupBeforeClear: true });
  await fs.promises.writeFile(settingsPath(directory), '');
  assert.deepEqual(await loadAppSettings(directory), { backupBeforeClear: true });
  await fs.promises.writeFile(settingsPath(directory), '{broken');
  assert.deepEqual(await loadAppSettings(directory), { backupBeforeClear: true });
});

test('app settings are atomically saved and loaded', async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'app-settings-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  await saveAppSettings(directory, { backupBeforeClear: false });
  assert.deepEqual(await loadAppSettings(directory), { backupBeforeClear: false });
  assert.deepEqual(await fs.promises.readdir(directory), ['app-settings.json']);
});

test('only known typed settings can be updated', async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'app-settings-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  assert.deepEqual(await updateAppSetting(directory, 'backupBeforeClear', false), { backupBeforeClear: false });
  await assert.rejects(updateAppSetting(directory, 'filePath', 'secret'), /許可されていない/);
});

test('renderer saves settings only on toggle changes', () => {
  const source = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
  assert.match(source, /backupBeforeClearToggle\.addEventListener\('change'/);
  assert.equal((source.match(/setBackupBeforeClear\(/g) || []).length, 1);
});
