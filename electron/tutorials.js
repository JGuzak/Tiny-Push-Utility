const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const TUTORIALS_FILE_NAME = 'tutorials.json';
const VALID_TUTORIAL_IDS = new Set(['ssh-connection-workflow']);

function getTutorialsPath() {
  return path.join(app.getPath('userData'), TUTORIALS_FILE_NAME);
}

function validateTutorialId(tutorialId) {
  if (!VALID_TUTORIAL_IDS.has(tutorialId)) {
    throw new Error('Unknown tutorial id.');
  }

  return tutorialId;
}

async function readSettings() {
  const tutorialsPath = getTutorialsPath();

  try {
    const contents = await fs.readFile(tutorialsPath, 'utf8');
    const parsedSettings = JSON.parse(contents);
    const disabledTutorials = Array.isArray(parsedSettings.disabledTutorials)
      ? parsedSettings.disabledTutorials.filter((tutorialId) => VALID_TUTORIAL_IDS.has(tutorialId))
      : [];

    return {
      disabledTutorials
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        disabledTutorials: []
      };
    }

    throw error;
  }
}

async function writeSettings(settings) {
  const tutorialsPath = getTutorialsPath();
  await fs.mkdir(path.dirname(tutorialsPath), { recursive: true });
  await fs.writeFile(tutorialsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

  return {
    ...settings,
    path: tutorialsPath
  };
}

async function isDisabled(tutorialId) {
  const validTutorialId = validateTutorialId(tutorialId);
  const settings = await readSettings();

  return {
    disabled: settings.disabledTutorials.includes(validTutorialId),
    tutorialId: validTutorialId
  };
}

async function disable(tutorialId) {
  const validTutorialId = validateTutorialId(tutorialId);
  const settings = await readSettings();
  const disabledTutorials = Array.from(new Set([...settings.disabledTutorials, validTutorialId]));
  const savedSettings = await writeSettings({ disabledTutorials });

  return {
    disabled: true,
    path: savedSettings.path,
    tutorialId: validTutorialId
  };
}

module.exports = {
  disable,
  getTutorialsPath,
  isDisabled,
  readSettings
};
