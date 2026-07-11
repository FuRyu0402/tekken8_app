const fs = require('fs');
const path = require('path');

const SETTINGS_FILE_NAME = 'app-settings.json';
const DEFAULT_SETTINGS = Object.freeze({ backupBeforeClear: true });

function settingsPath(userDataPath) {
  return path.join(userDataPath, SETTINGS_FILE_NAME);
}

function normalizeSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, defaultValue]) => [
    key,
    typeof source[key] === typeof defaultValue ? source[key] : defaultValue,
  ]));
}

async function loadAppSettings(userDataPath, fsPromises = fs.promises) {
  try {
    const contents = await fsPromises.readFile(settingsPath(userDataPath), 'utf8');
    if (!contents.trim()) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(contents));
  } catch (_error) {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveAppSettings(userDataPath, settings, fsPromises = fs.promises) {
  const normalized = normalizeSettings(settings);
  const destination = settingsPath(userDataPath);
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsPromises.mkdir(userDataPath, { recursive: true });
    await fsPromises.writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await fsPromises.rename(temporary, destination);
  } catch (error) {
    try { await fsPromises.unlink(temporary); } catch (_cleanupError) { /* nothing to clean up */ }
    throw new Error(`アプリ設定を保存できませんでした: ${error.message}`);
  }
  return normalized;
}

async function updateAppSetting(userDataPath, key, value, fsPromises = fs.promises) {
  if (!Object.hasOwn(DEFAULT_SETTINGS, key) || typeof value !== typeof DEFAULT_SETTINGS[key]) {
    throw new Error('許可されていない設定です。');
  }
  const current = await loadAppSettings(userDataPath, fsPromises);
  return saveAppSettings(userDataPath, { ...current, [key]: value }, fsPromises);
}

module.exports = {
  DEFAULT_SETTINGS,
  SETTINGS_FILE_NAME,
  loadAppSettings,
  normalizeSettings,
  saveAppSettings,
  settingsPath,
  updateAppSetting,
};
