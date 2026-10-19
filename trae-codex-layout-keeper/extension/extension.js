'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const core = require('./core');
const CONFIG = 'traeCodexLayout.keepAfterUpdate';
let busy = false;

function activate(context) {
  const output = vscode.window.createOutputChannel('Trae Codex 布局保持');
  context.subscriptions.push(output);
  const appRoot = vscode.env.appRoot;
  const storage = context.globalStorageUri.fsPath;
  fs.mkdirSync(storage, {recursive: true});
  function log(message) { output.appendLine(new Date().toISOString() + ' ' + message); }
  function acquire() {
    const file = path.join(storage, 'repair.lock');
    try {
      const handle = fs.openSync(file, 'wx');
      fs.writeFileSync(handle, JSON.stringify({pid: process.pid, time: Date.now()})); fs.closeSync(handle);
      return () => { try { fs.unlinkSync(file); } catch {} };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Number.isInteger(lock.pid) || lock.pid <= 0) return null;
        try { process.kill(lock.pid, 0); } catch (reason) {
          if (reason.code === 'ESRCH') { fs.unlinkSync(file); return acquire(); }
        }
      } catch {}
      return null;
    }
  }
  async function restart() {
    const mainPid = Number(process.env.VSCODE_PID);
    if (!Number.isInteger(mainPid) || mainPid <= 0 || !fs.existsSync(process.execPath)) {
      return vscode.window.showInformationMessage('请完整退出 Trae 后重新打开；仅关闭窗口可能仍留在后台。');
    }
    const folders = vscode.workspace.workspaceFolders || [];
    let args = [];
    if (vscode.workspace.workspaceFile?.scheme === 'file') args = [vscode.workspace.workspaceFile.fsPath];
    else if (folders.length) args = ['--folder-uri', folders[0].uri.toString()];
    const helper = cp.spawn(process.execPath, [path.join(__dirname, 'restart.js'), String(mainPid), process.execPath, JSON.stringify(args)],
      {env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}, detached: true, windowsHide: true, stdio: 'ignore'});
    helper.on('error', error => log('重启辅助进程失败：' + error.message));
    helper.unref();
    await vscode.commands.executeCommand('workbench.action.quit');
  }
  async function check(manual = false) {
    if (busy) return;
    busy = true;
    let release;
    try {
      if (process.platform !== 'win32' || !/trae/i.test(vscode.env.appName)) {
        if (manual) vscode.window.showInformationMessage('布局保持只对 Windows Trae 生效。');
        return;
      }
      const enabled = vscode.workspace.getConfiguration().get(CONFIG, true);
      if (!enabled) {
        log('布局保持已关闭；没有修改自动更新设置。');
        if (manual) vscode.window.showInformationMessage('布局保持已关闭。现有补丁保留，但不会在升级后自动修复。');
        return;
      }
      release = acquire();
      if (!release) { log('其他窗口正在检查，跳过本次写入。'); return; }
      const snapshot = core.inspect(appRoot);
      const identity = String(snapshot.product.commit || snapshot.product.version);
      log(JSON.stringify({commit: identity, enabled, files: snapshot.files.map(file => ({file: file.relative, state: file.state}))}));
      if (snapshot.files.some(file => file.state === 'native-or-changed')) {
        await context.globalState.update('lastStatus', {state: 'native-or-changed', commit: identity, at: Date.now()});
        if (manual || context.globalState.get('nativeNotice') !== identity) {
          await context.globalState.update('nativeNotice', identity);
          vscode.window.showInformationMessage('新版 Trae 已有不同的右侧栏实现，未套用旧补丁。请确认 Codex 位置；需要时运行“检查布局保持状态”。');
        }
        return;
      }
      if (snapshot.files.every(file => file.state === 'protected')) {
        await context.globalState.update('lastStatus', {state: 'protected', commit: identity, at: Date.now()});
        if (manual) vscode.window.showInformationMessage('布局保持已启用：Codex 右侧栏补丁完整，资源校验通过。Trae 自动更新设置未改动。');
        return;
      }
      // Wait once and resample; never watch or lock the updater's staging files.
      await new Promise(resolve => setTimeout(resolve, 1500));
      const next = core.inspect(appRoot);
      if (core.sha(next.productBytes) !== core.sha(snapshot.productBytes)
        || next.files.some((file, index) => core.sha(file.before) !== core.sha(snapshot.files[index].before))) {
        log('安装文件正在变化，跳过。'); return;
      }
      const backup = core.apply(appRoot, storage, next);
      log('已自动修复，备份：' + backup);
      await context.globalState.update('lastStatus', {state: 'restart-required', commit: identity, backup, at: Date.now()});
      const answer = await vscode.window.showInformationMessage('已为新版 Trae 恢复 Codex 右侧栏兼容。完整重启后生效，自动更新未被关闭。', '完整重启 Trae', '查看日志');
      if (answer === '完整重启 Trae') await restart();
      if (answer === '查看日志') output.show();
    } catch (error) {
      log('未继续自动修复：' + (error.stack || error.message));
      const signature = String(error.message);
      await context.globalState.update('lastStatus', {state: 'unsupported-or-error', message: signature, at: Date.now()});
      if (manual || context.globalState.get('lastErrorNotice') !== signature) {
        await context.globalState.update('lastErrorNotice', signature);
        const answer = await vscode.window.showWarningMessage('Codex 布局保持暂未修复此版本：' + signature + ' Trae 自动更新不受限制。', '查看日志');
        if (answer === '查看日志') output.show();
      }
    } finally { if (release) release(); busy = false; }
  }
  context.subscriptions.push(vscode.commands.registerCommand('traeCodexLayout.check', () => check(true)));
  context.subscriptions.push(vscode.commands.registerCommand('traeCodexLayout.logs', () => output.show()));
  context.subscriptions.push(vscode.commands.registerCommand('traeCodexLayout.backups', () => vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(storage))));
  context.subscriptions.push(vscode.commands.registerCommand('traeCodexLayout.restore', async () => {
    if (busy) return;
    const answer = await vscode.window.showWarningMessage('关闭布局保持并还原最近一次自动修复？只还原匹配当前版本的安装文件。', {modal: true}, '还原');
    if (answer !== '还原') return;
    busy = true; let release;
    try {
      release = acquire(); if (!release) throw new Error('其他窗口正在修复，请稍后重试。');
      const backup = core.restoreLatest(appRoot, storage);
      await vscode.workspace.getConfiguration().update(CONFIG, false, vscode.ConfigurationTarget.Global);
      log('已还原：' + backup);
      vscode.window.showInformationMessage('已还原并关闭自动修复。完整重启 Trae 后生效。');
    } catch (error) { vscode.window.showErrorMessage(error.message); }
    finally { if (release) release(); busy = false; }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration(CONFIG)) void check(false); }));
  void check(false);
}
module.exports = {activate, deactivate() {}};
