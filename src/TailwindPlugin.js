// src/TailwindTaskPlugin.js (CJS)
const { runAutoDiscoveryBuild } = require('./BuildTailwind');
const path = require('node:path');

class TailwindTaskPlugin {
  apply(heftSession, heftConfiguration) {
    const run = async () => {
      const log = (m) => heftSession.logger.terminal.writeLine(m);
      // Prefer projectFolder; fallback to parent of buildFolderPath
      const root =
        heftConfiguration.projectFolder ||
        path.dirname(heftConfiguration.buildFolderPath);
      await runAutoDiscoveryBuild({ root, log });
    };

    // run once
    heftSession.hooks.run.tapPromise('tailwind-plugin', async () => { await run(); });
    // watch/incremental
    heftSession.hooks.runIncremental.tapPromise('tailwind-plugin', async () => { await run(); });
  }
}

module.exports = TailwindTaskPlugin;
module.exports.default = TailwindTaskPlugin;
