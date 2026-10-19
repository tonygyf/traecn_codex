'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const cp = require('child_process');
const core = require('./extension/core');
const original = path.resolve(__dirname, '../trae-codex-right-sidebar/backup-20261019-194420');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-layout-keeper-test-'));
const app = path.join(fixture, 'app'), store = path.join(fixture, 'user-data');
fs.mkdirSync(path.join(app, 'out/vs/workbench'), {recursive: true});
fs.mkdirSync(store);
const files = ['workbench.desktop.main.js', 'workbench.desktop.main.solo-lite.js'];
for (const file of files) fs.copyFileSync(path.join(original, file), path.join(app, 'out/vs/workbench', file));
fs.copyFileSync(path.join(original, 'product.json'), path.join(app, 'product.json'));
const baseline = new Map([['product.json', fs.readFileSync(path.join(app, 'product.json'))], ...files.map(file => [file, fs.readFileSync(path.join(original, file))])]);
const unpatched = core.inspect(app);
assert(unpatched.files.every(file => file.state === 'repairable'));
const backup = core.apply(app, store, unpatched);
assert(backup && core.inspect(app).files.every(file => file.state === 'protected'));
for (const file of files) cp.execFileSync(process.execPath, ['--check', path.join(app, 'out/vs/workbench', file)], {windowsHide: true});
assert.equal(core.apply(app, store, core.inspect(app)), null, 'Repeated repair must not write again');
assert.equal(fs.readdirSync(path.join(store, 'backups')).length, 1);
const corrupt = path.join(app, 'out/vs/workbench', files[0]);
const valid = fs.readFileSync(corrupt);
fs.appendFileSync(corrupt, '\n// simulated external modification');
assert.throws(() => core.inspect(app), /校验不匹配/);
assert.throws(() => core.restoreLatest(app, store), /已改变/);
fs.writeFileSync(corrupt, valid);
core.restoreLatest(app, store);
assert.deepEqual(fs.readFileSync(path.join(app, 'product.json')), baseline.get('product.json'));
for (const file of files) assert.deepEqual(fs.readFileSync(path.join(app, 'out/vs/workbench', file)), baseline.get(file));

const renamed = `class ChangedBuild {
addCustomViewContainers(contributions,existingContainers){for(const {value:categories,description:owner} of contributions)Object.entries(categories).forEach(([kind,entries])=>{switch(kind){case"activitybar":this.registerCustomViewContainers(entries,owner,0,existingContainers,0);break;case"panel":this.registerCustomViewContainers(entries,owner,1,existingContainers,1);break;}})}
registerCustomViewContainer(id,title,icon,order,extensionIdentity,targetArea){return this.viewContainersRegistry.registerViewContainer({id,extensionId:extensionIdentity,order,icon},targetArea)}
}`;
const renamedPlan = core.planSource(renamed);
assert.equal(renamedPlan.state, 'repairable');
assert.equal(core.planSource(renamedPlan.source).state, 'protected');
assert(renamedPlan.source.includes('owner.identifier.value==="openai.chatgpt"'));
assert(renamedPlan.source.includes('targetArea===2&&extensionIdentity?.value'));
assert.equal(core.planSource(renamed.replace('case"panel":', 'case"secondarySidebar":break;case"panel":')).state, 'native-or-changed');
assert.throws(() => core.planSource(renamed.replace('order,icon}', 'order,icon,type:"different"}')), /其他容器类型/);
assert.throws(() => core.planSource(renamed.replace('existingContainers,1)', 'existingContainers,9)')), /参数已改变/);
assert.throws(() => core.planSource(renamed + renamed.replace('ChangedBuild', 'AnotherBuild')), /匹配数量/);

// Exercise extension activation with the real parser and a mocked host.
const Module = require('module'), load = Module._load;
const state = new Map(), commands = new Map(), logs = [];
let enabled = false;
const host = {
  env: {appRoot: app, appName: 'Trae CN'},
  window: {createOutputChannel: () => ({appendLine: line => logs.push(line), show() {}, dispose() {}}),
    showInformationMessage: async () => undefined, showWarningMessage: async () => undefined},
  workspace: {getConfiguration: () => ({get: () => enabled}), onDidChangeConfiguration: () => ({dispose() {}})},
  commands: {registerCommand: (name, action) => {commands.set(name, action); return {dispose() {}};}},
};
Module._load = function(name, ...args) { return name === 'vscode' ? host : load.call(this, name, ...args); };
const extension = require('./extension/extension');
Module._load = load;
const context = {subscriptions: [], globalStorageUri: {fsPath: store}, globalState: {
  get: key => state.get(key), update: async (key, value) => {state.set(key, value);},
}};
extension.activate(context);
assert(logs.some(line => line.includes('已关闭')));
assert(core.inspect(app).files.every(file => file.state === 'repairable'), 'Disabled guard must not alter installed files');
enabled = true;
(async () => {
  await commands.get('traeCodexLayout.check')();
  assert.equal(state.get('lastStatus').state, 'restart-required');
  assert(core.inspect(app).files.every(file => file.state === 'protected'));
  await commands.get('traeCodexLayout.check')();
  assert.equal(state.get('lastStatus').state, 'protected');
  assert(!fs.existsSync(path.join(store, 'repair.lock')), 'No repair lock left behind');
  console.log('PASS: simulated update, renamed identifiers, syntax, checksum rejection, unknown/native builds, duplicate anchors, idempotency, exact rollback, disabled setting, startup repair, and lock cleanup.');
  console.log('Fixture retained for inspection:', fixture);
})().catch(error => {console.error(error); process.exitCode = 1;});
