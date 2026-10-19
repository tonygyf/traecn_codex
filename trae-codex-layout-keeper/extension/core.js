'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const acorn = require('./vendor/acorn');
const MARKER = 'local-codex-secondary-sidebar-v2';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const checksum = data => crypto.createHash('sha256').update(data).digest('base64').replace(/=+$/, '');
const options = {ecmaVersion: 'latest', sourceType: 'module'};

function walk(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) value.forEach(item => walk(item, predicate, result));
    else if (value && typeof value === 'object') walk(value, predicate, result);
  }
  return result;
}
function unique(items, label) {
  if (items.length !== 1) throw new Error(`不支持此版本：${label} 匹配数量为 ${items.length}，没有写入安装文件。`);
  return items[0];
}
function method(source, name) {
  const matches = [...source.matchAll(new RegExp('\\b' + name + '\\(([$\\w,]*)\\)\\{', 'g'))];
  const match = unique(matches, name);
  const start = match.index;
  const open = start + match[0].length - 1;
  const tokenizer = acorn.tokenizer(source.slice(open, open + 200000), options);
  let depth = 0, end;
  while (true) {
    const token = tokenizer.getToken(), label = token.type.label;
    if (label === 'eof') break;
    if (label === '{' || label === '${') depth++;
    if (label === '}' && --depth === 0) { end = open + token.end; break; }
  }
  if (!end) throw new Error(`不支持此版本：无法确定 ${name} 的边界。`);
  const prefix = 'class Probe{';
  const text = source.slice(start, end);
  const ast = acorn.parse(prefix + text + '}', options).body[0].body.body[0];
  return {start, end, text, ast, absolute: position => start + position - prefix.length,
    textOf: node => source.slice(start + node.start - prefix.length, start + node.end - prefix.length)};
}
function thisCall(node, property) {
  return node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
    && node.callee.object.type === 'ThisExpression' && node.callee.property.name === property;
}
function planSource(source) {
  const add = method(source, 'addCustomViewContainers');
  const register = method(source, 'registerCustomViewContainer');
  const targetSwitch = unique(walk(add.ast, node => node.type === 'SwitchStatement'
    && ['activitybar', 'panel'].every(label => node.cases.some(item => item.test?.value === label))), '容器注册 switch');
  const secondary = targetSwitch.cases.find(item => item.test?.value === 'secondarySidebar');
  const registration = unique(walk(register.ast, node => node.type === 'CallExpression'
    && node.callee.type === 'MemberExpression' && node.callee.property.name === 'registerViewContainer'
    && node.arguments[0]?.type === 'ObjectExpression'), '容器定义');
  const object = registration.arguments[0];
  const type = object.properties.find(item => item.key?.name === 'type');
  const owned = add.text.includes('/*local-codex-secondary-sidebar-v1*/') || add.text.includes(`/*${MARKER}*/`);
  if (secondary) {
    if (owned) {
      const extension = unique(object.properties.filter(item => item.key?.name === 'extensionId'), 'extensionId');
      const location = registration.arguments[1];
      const expected = `${location.name}===2&&${extension.value.name}?.value==="openai.chatgpt"?"ai":void 0`;
      if (!type || register.textOf(type.value).replace(/\s+/g, '') !== expected.replace(/\s+/g, '')) throw new Error('既有布局补丁不完整，已停止自动修复。');
      return {state: 'protected', source};
    }
    return {state: 'native-or-changed', source};
  }
  if (type) throw new Error('新版已有其他容器类型实现，已停止自动套用旧补丁。');
  const panelCase = targetSwitch.cases.find(item => item.test?.value === 'panel');
  const panelCall = unique(walk(panelCase, node => thisCall(node, 'registerCustomViewContainers')), 'panel 容器注册调用');
  if (panelCall.arguments.length !== 5 || panelCall.arguments[4].value !== 1) throw new Error('新版容器注册参数已改变。');
  const [views, description, , existing] = panelCall.arguments;
  if (![views, description, existing].every(node => node.type === 'Identifier')) throw new Error('新版容器注册参数结构已改变。');
  const extension = unique(object.properties.filter(item => item.key?.name === 'extensionId'), 'extensionId');
  const location = registration.arguments[1];
  if (extension.value.type !== 'Identifier' || location?.type !== 'Identifier') throw new Error('新版容器身份结构已改变。');
  const caseCode = `case"secondarySidebar":/*${MARKER}*/${description.name}.identifier.value==="openai.chatgpt"&&this.registerCustomViewContainers(${views.name},${description.name},100,${existing.name},2);break;`;
  const typeCode = `type:${location.name}===2&&${extension.value.name}?.value==="openai.chatgpt"?"ai":void 0,`;
  const edits = [
    {at: add.absolute(panelCase.end), text: ';' + caseCode},
    {at: register.absolute(object.start) + 1, text: typeCode},
  ].sort((a, b) => b.at - a.at);
  let output = source;
  for (const edit of edits) output = output.slice(0, edit.at) + edit.text + output.slice(edit.at);
  // Reparse both modified methods, then verify that the patch recognizes itself.
  method(output, 'addCustomViewContainers');
  method(output, 'registerCustomViewContainer');
  if (planSource(output).state !== 'protected') throw new Error('补丁验证失败。');
  return {state: 'repairable', source: output};
}

function inspect(appRoot) {
  const productPath = path.join(appRoot, 'product.json');
  const productBytes = fs.readFileSync(productPath);
  const product = JSON.parse(productBytes);
  const names = ['workbench.desktop.main.js', 'workbench.desktop.main.solo-lite.js'];
  const files = [];
  for (const name of names) {
    const relative = `out/vs/workbench/${name}`;
    const file = path.join(appRoot, relative);
    if (!fs.existsSync(file)) { if (name.includes('solo-lite')) continue; throw new Error('未找到 Trae workbench 文件。'); }
    const before = fs.readFileSync(file), key = relative.slice(4);
    if (product.checksums?.[key] !== checksum(before)) throw new Error(`安装资源校验不匹配，已停止写入：${name}`);
    const result = planSource(before.toString('utf8'));
    files.push({relative, key, before, after: Buffer.from(result.source), state: result.state});
  }
  return {product, productPath, productBytes, files};
}
function replaceFile(file, data) {
  const temporary = file + `.layout-keeper-${process.pid}.tmp`;
  try { fs.writeFileSync(temporary, data, {flag: 'wx'}); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function apply(appRoot, storage, snapshot) {
  const changed = snapshot.files.filter(file => file.state === 'repairable');
  if (!changed.length) return null;
  if (snapshot.files.some(file => file.state === 'native-or-changed')) throw new Error('两个 workbench 实现不一致，已停止自动写入。');
  const backup = path.join(storage, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
  fs.mkdirSync(backup, {recursive: true});
  fs.writeFileSync(path.join(backup, 'product.json'), snapshot.productBytes);
  let updatedProduct = snapshot.productBytes.toString('utf8');
  const records = [];
  for (const file of changed) {
    fs.writeFileSync(path.join(backup, path.basename(file.relative)), file.before);
    const old = checksum(file.before), updated = checksum(file.after);
    if (updatedProduct.split(old).length !== 2) throw new Error('资源校验条目不唯一，已停止写入。');
    updatedProduct = updatedProduct.replace(old, updated);
    records.push({relative: file.relative, beforeSha256: sha(file.before), afterSha256: sha(file.after)});
  }
  const productAfter = Buffer.from(updatedProduct);
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({appRoot, commit: snapshot.product.commit,
    version: snapshot.product.version, files: records, productBefore: sha(snapshot.productBytes), productAfter: sha(productAfter)}, null, 2));
  // Do not overwrite an installer or another window's changes.
  if (sha(fs.readFileSync(snapshot.productPath)) !== sha(snapshot.productBytes)
    || snapshot.files.some(file => sha(fs.readFileSync(path.join(appRoot, file.relative))) !== sha(file.before))) {
    throw new Error('安装文件正在变化，已让出处理；下次启动再检查。');
  }
  const written = [];
  try {
    for (const file of changed) { replaceFile(path.join(appRoot, file.relative), file.after); written.push(file); }
    replaceFile(snapshot.productPath, productAfter);
  } catch (error) {
    for (const file of written.reverse()) {
      const target = path.join(appRoot, file.relative);
      if (sha(fs.readFileSync(target)) === sha(file.after)) replaceFile(target, file.before);
    }
    if (sha(fs.readFileSync(snapshot.productPath)) === sha(productAfter)) replaceFile(snapshot.productPath, snapshot.productBytes);
    throw error;
  }
  const verified = inspect(appRoot);
  if (verified.files.some(file => file.state !== 'protected')) throw new Error(`写入后校验失败，备份在 ${backup}`);
  fs.writeFileSync(path.join(storage, 'latest-backup.txt'), backup);
  return backup;
}
function restoreLatest(appRoot, storage) {
  const backup = fs.readFileSync(path.join(storage, 'latest-backup.txt'), 'utf8').trim();
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
  if (path.resolve(manifest.appRoot).toLowerCase() !== path.resolve(appRoot).toLowerCase()) throw new Error('备份属于不同的安装目录。');
  if (sha(fs.readFileSync(path.join(appRoot, 'product.json'))) !== manifest.productAfter) throw new Error('Trae 已更新或文件已改变，不能覆盖当前版本。');
  for (const record of manifest.files) {
    if (sha(fs.readFileSync(path.join(appRoot, record.relative))) !== record.afterSha256) throw new Error('Trae 已更新或文件已改变，不能还原旧文件。');
    if (sha(fs.readFileSync(path.join(backup, path.basename(record.relative)))) !== record.beforeSha256) throw new Error('备份校验失败。');
  }
  const originalProduct = fs.readFileSync(path.join(backup, 'product.json'));
  if (sha(originalProduct) !== manifest.productBefore) throw new Error('备份 product.json 校验失败。');
  for (const record of manifest.files) replaceFile(path.join(appRoot, record.relative), fs.readFileSync(path.join(backup, path.basename(record.relative))));
  replaceFile(path.join(appRoot, 'product.json'), originalProduct);
  return backup;
}
module.exports = {planSource, inspect, apply, restoreLatest, checksum, sha};
