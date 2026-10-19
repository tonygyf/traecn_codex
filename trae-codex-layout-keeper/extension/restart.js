'use strict';
const cp = require('child_process');
const [pidText, executable, argsText] = process.argv.slice(2);
const pid = Number(pidText), args = JSON.parse(argsText || '[]');
if (!Number.isInteger(pid) || pid <= 0 || !Array.isArray(args)) process.exit(1);
const deadline = Date.now() + 120000;
function poll() {
  try { process.kill(pid, 0); }
  catch (error) {
    if (error.code !== 'ESRCH') return;
    const env = {...process.env};
    delete env.ELECTRON_RUN_AS_NODE; delete env.VSCODE_PID; delete env.VSCODE_IPC_HOOK; delete env.VSCODE_IPC_HOOK_CLI;
    cp.spawn(executable, args, {env, detached: true, windowsHide: true, stdio: 'ignore'}).unref();
    return;
  }
  if (Date.now() < deadline) setTimeout(poll, 500);
}
poll();
