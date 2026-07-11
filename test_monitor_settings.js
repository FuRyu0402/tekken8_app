const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { findSavedMonitor, loadMonitorSettings, saveMonitorSettings, settingsPath } = require('./monitor_settings');

const monitor = { index: 2, left: 1920, top: 0, width: 2560, height: 1440, name: 'Display', unique_id: 'abc' };

test('monitor settings are saved atomically and loaded', async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'monitor-settings-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  await saveMonitorSettings(directory, monitor);
  assert.deepEqual(await loadMonitorSettings(directory), monitor);
  assert.equal((await fs.promises.readdir(directory)).length, 1);
  assert.equal(path.basename(settingsPath(directory)), 'monitor-settings.json');
});

test('unique_id has the highest matching priority', () => {
  const monitors = [{ ...monitor, index: 5, unique_id: 'other' }, { ...monitor, index: 8, left: 0, unique_id: 'abc' }];
  assert.equal(findSavedMonitor(monitors, monitor).index, 8);
});

test('geometry is used when unique_id does not match', () => {
  assert.equal(findSavedMonitor([{ ...monitor, index: 7, unique_id: 'new' }], monitor).index, 7);
});

test('index is the final fallback', () => {
  assert.equal(findSavedMonitor([{ ...monitor, left: 0, unique_id: 'new' }], monitor).index, 2);
});

test('missing saved monitor safely returns null', () => {
  assert.equal(findSavedMonitor([{ ...monitor, index: 9, left: 0, unique_id: 'new' }], monitor), null);
});

test('missing empty broken and invalid settings safely load as null', async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'monitor-settings-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  assert.equal(await loadMonitorSettings(directory), null);
  await fs.promises.writeFile(settingsPath(directory), '');
  assert.equal(await loadMonitorSettings(directory), null);
  await fs.promises.writeFile(settingsPath(directory), '{broken');
  assert.equal(await loadMonitorSettings(directory), null);
  await fs.promises.writeFile(settingsPath(directory), '{}');
  assert.equal(await loadMonitorSettings(directory), null);
});

test('save failure is reported without stopping the application', async () => {
  const failingFs = { mkdir: async () => {}, writeFile: async () => { throw new Error('disk full'); }, unlink: async () => {} };
  await assert.rejects(saveMonitorSettings('ignored', monitor, failingFs), /保存できませんでした.*disk full/);
});

test('renderer reload restores and persistence runs only on selection change', () => {
  const source = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
  assert.match(source, /shouldRestoreMonitor && monitors\.length > 0/);
  assert.match(source, /restoreMonitorSelection\(\)/);
  assert.match(source, /monitorSelect\.addEventListener\('change'/);
  assert.equal((source.match(/saveMonitorSelection\(/g) || []).length, 1);
});
