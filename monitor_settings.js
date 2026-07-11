const fs = require('fs');
const path = require('path');

const SETTINGS_FILE_NAME = 'monitor-settings.json';
const MONITOR_FIELDS = ['index', 'left', 'top', 'width', 'height'];

function settingsPath(userDataPath) { return path.join(userDataPath, SETTINGS_FILE_NAME); }

function normalizeMonitor(monitor) {
  if (!monitor || MONITOR_FIELDS.some((field) => !Number.isInteger(monitor[field]))) return null;
  const normalized = Object.fromEntries(MONITOR_FIELDS.map((field) => [field, monitor[field]]));
  if (typeof monitor.name === 'string' && monitor.name) normalized.name = monitor.name;
  if (typeof monitor.unique_id === 'string' && monitor.unique_id) normalized.unique_id = monitor.unique_id;
  return normalized;
}

async function loadMonitorSettings(userDataPath, fsPromises = fs.promises) {
  try {
    const contents = await fsPromises.readFile(settingsPath(userDataPath), 'utf8');
    if (!contents.trim()) return null;
    return normalizeMonitor(JSON.parse(contents));
  } catch (_error) { return null; }
}

async function saveMonitorSettings(userDataPath, monitor, fsPromises = fs.promises) {
  const normalized = normalizeMonitor(monitor);
  if (!normalized) throw new Error('保存するモニター情報が不正です。');
  const destination = settingsPath(userDataPath);
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsPromises.mkdir(userDataPath, { recursive: true });
    await fsPromises.writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await fsPromises.rename(temporary, destination);
  } catch (error) {
    try { await fsPromises.unlink(temporary); } catch (_cleanupError) { /* nothing to clean up */ }
    throw new Error(`モニター設定を保存できませんでした: ${error.message}`);
  }
  return normalized;
}

function findSavedMonitor(monitors, savedMonitor) {
  if (!Array.isArray(monitors) || !savedMonitor) return null;
  if (savedMonitor.unique_id) {
    const match = monitors.find((item) => item.unique_id === savedMonitor.unique_id);
    if (match) return match;
  }
  const geometryMatch = monitors.find((item) => (
    item.left === savedMonitor.left && item.top === savedMonitor.top
    && item.width === savedMonitor.width && item.height === savedMonitor.height
  ));
  if (geometryMatch) return geometryMatch;
  return monitors.find((item) => item.index === savedMonitor.index) || null;
}

module.exports = { SETTINGS_FILE_NAME, findSavedMonitor, loadMonitorSettings, normalizeMonitor, saveMonitorSettings, settingsPath };
