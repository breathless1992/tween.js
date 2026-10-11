'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() && !['node_modules', '.git', 'artifacts'].includes(e.name) ? walk(path.join(dir, e.name)) : e.isFile() ? [path.join(dir, e.name)] : []);
}
const files = walk(root);
let js = 0, json = 0;
for (const file of files) {
  if (file.endsWith('.js')) { cp.execFileSync(process.execPath, ['--check', file]); js++; }
  if (file.endsWith('.json')) { JSON.parse(fs.readFileSync(file)); json++; }
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')));
const mini = path.join(root, config.miniprogramRoot);
const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json')));
for (const file of ['app.js', 'app.json', 'app.wxss', ...app.pages.flatMap(p => ['.js', '.json', '.wxml', '.wxss'].map(ext => p + ext))]) {
  if (!fs.existsSync(path.join(mini, file))) throw new Error('Missing ' + file);
}
for (const file of files.filter(f => f.endsWith('.js') && f.startsWith(mini))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(file), match[1] + '.js'))) throw new Error('Missing require: ' + file + ' -> ' + match[1]);
  }
}
// Verify WXML event handlers and local resource references (not a WeChat compiler).
for (const page of app.pages) {
  const wxml = fs.readFileSync(path.join(mini, page + '.wxml'), 'utf8');
  const source = fs.readFileSync(path.join(mini, page + '.js'), 'utf8');
  const stack = [];
  for (const match of wxml.matchAll(/<\/?([\w-]+)\b[^>]*>/g)) {
    const tag = match[0];
    if (tag.startsWith('</')) { if (stack.pop() !== match[1]) throw new Error('Unbalanced WXML ' + page); }
    else if (!tag.endsWith('/>')) stack.push(match[1]);
  }
  if (stack.length) throw new Error('Unclosed WXML ' + page);
  for (const match of wxml.matchAll(/(?:bind(?:tap|change)|catchtap)="([A-Za-z_][A-Za-z0-9_]*)"/g)) {
    if (!new RegExp('\\b' + match[1] + '\\s*\\(').test(source)) throw new Error('Missing handler ' + match[1]);
  }
  for (const match of wxml.matchAll(/(?:src|href)="([^"{]+)"/g)) {
    if (!match[1].startsWith('http') && !fs.existsSync(path.resolve(path.dirname(path.join(mini, page)), match[1]))) throw new Error('Missing WXML resource');
  }
}
for (const file of files.filter(f => f.endsWith('.wxss'))) {
  const css = fs.readFileSync(file, 'utf8');
  if ((css.match(/\{/g) || []).length !== (css.match(/\}/g) || []).length) throw new Error('Unbalanced WXSS ' + file);
  for (const match of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(file), match[1]))) throw new Error('Missing WXSS import');
  }
}
console.log(`Project structure/references valid; syntax: ${js} JS, ${json} JSON. WeChat compilation/device checks remain separate.`);
