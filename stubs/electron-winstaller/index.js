'use strict';

async function createWindowsInstaller() {
  throw new Error('Squirrel.Windows packaging is not available in this project. Use the configured portable Windows target instead.');
}

module.exports = {
  createWindowsInstaller
};