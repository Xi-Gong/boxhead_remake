// Preload in the QA Node process: mute Chromium output before any window/audio device opens.
// WebAudio still runs, so decoding, analyser and recovery assertions remain meaningful.
const childProcess = require('node:child_process');
const { basename } = require('node:path');
const { syncBuiltinESMExports } = require('node:module');
const spawn = childProcess.spawn;
childProcess.spawn = function (file, args, options) {
  if (/^(?:chrome|electron|boxhead.*)\.exe$/i.test(basename(String(file)))) {
    if (Array.isArray(args)) args = [...args];
    else { options = args ?? options; args = []; }
    if (!args.includes('--mute-audio')) args.push('--mute-audio');
    process.stderr.write('QA audio output muted: ' + basename(String(file)) + '\n');
  }
  return spawn.call(this, file, args, options);
};
syncBuiltinESMExports();
// Playwright wraps Windows Electron commands in a quoted shell command. Add the
// switch at its public launch API as well, before that command is assembled.
const { chromium, _electron } = require('playwright-core');
for (const api of [chromium, _electron]) {
  const launch = api.launch;
  api.launch = function (options = {}) {
    const args = [...(options.args ?? [])];
    if (!args.includes('--mute-audio')) args.push('--mute-audio');
    process.stderr.write('QA launch requires --mute-audio\n');
    return launch.call(this, { ...options, args });
  };
}
