#!/usr/bin/env node
/* 小红书小工具兼容基线检查：Android 8.1 出厂 Chrome / WebView 61（官方文档 https://miniapp-sandbox.xiaohongshu.com/minitool/doc §2.2：编译到 ES2017 / Chrome 61）。
   用 TypeScript 的解析器（全局安装的 typescript）扫 .js / .html 里的外链脚本，报两类问题：
     [语法]  Chrome 61 解析不了的语法（?. ?? 可选 catch 绑定、类字段、BigInt、正则后行断言 / 命名分组 / s 标志 / \p{}、for await、异步生成器、数字分隔符、动态 import、逻辑赋值……）
             一个这样的语法就会让整个脚本文件“Unexpected token”，页面白屏或按钮全都没反应；
     [接口]  Chrome 61 没有的运行时 API（flat / flatMap / fromEntries / replaceAll / at / matchAll / allSettled / finally / trimStart / globalThis / queueMicrotask / structuredClone…），
             没做能力检测直接调用会抛 TypeError。这一类只是启发式扫描（看到名字就报），人工判断有没有 if 保护。
   用法：node es2017_check.js <目录或文件> [...]   退出码：有 [语法] 问题 = 1，否则 0。
   对象展开 / 剩余（{...a}）是 ES2018，但 Chrome 60 就支持，不算问题。 */
'use strict';
const fs = require('fs'), path = require('path'), { createRequire } = require('module');
const TS_DIRS = [process.env.TS_PATH, path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'typescript'), 'typescript'].filter(Boolean);
let ts = null;
for (const d of TS_DIRS) { try { ts = createRequire(__filename)(d); break; } catch (e) { /* 试下一个 */ } }
if (!ts) { console.error('找不到 typescript：npm i -g typescript，或设置环境变量 TS_PATH 指向它'); process.exit(2); }
const K = ts.SyntaxKind;

const RUNTIME = [
  [/\.flatMap\s*\(/, 'Array.prototype.flatMap（Chrome 69）'], [/\.flat\s*\(/, 'Array.prototype.flat（Chrome 69）'],
  [/Object\.fromEntries\b/, 'Object.fromEntries（Chrome 73）'], [/\.replaceAll\s*\(/, 'String.prototype.replaceAll（Chrome 85）'],
  [/\.matchAll\s*\(/, 'String.prototype.matchAll（Chrome 73）'], [/\.at\s*\(\s*-?\d/, 'Array/String.prototype.at（Chrome 92）'],
  [/Promise\.allSettled\b/, 'Promise.allSettled（Chrome 76）'], [/Promise\.any\b/, 'Promise.any（Chrome 85）'],
  [/\)\s*\.finally\s*\(|\.finally\s*\(\s*(?:function|\(|\w+\s*=>)/, 'Promise.prototype.finally（Chrome 63）'],
  [/\.trimStart\s*\(|\.trimEnd\s*\(/, 'String.prototype.trimStart/trimEnd（Chrome 66）'], [/\bglobalThis\b/, 'globalThis（Chrome 71）'],
  [/\bqueueMicrotask\s*\(/, 'queueMicrotask（Chrome 71）'], [/\bstructuredClone\s*\(/, 'structuredClone（Chrome 98）'],
  [/\bObject\.hasOwn\b/, 'Object.hasOwn（Chrome 93）'], [/\.findLast(?:Index)?\s*\(/, 'Array.prototype.findLast（Chrome 97）'],
  [/\bnew\s+ResizeObserver\b/, 'ResizeObserver（Chrome 64）'], [/\bnew\s+AbortController\b/, 'AbortController（Chrome 66）'],
  [/\bOffscreenCanvas\b/, 'OffscreenCanvas（Chrome 69，且容器禁用 Worker）'], [/\bAudioWorklet\b/, 'AudioWorklet（Chrome 66）'],
  [/\bnew\s+Intl\.(?:ListFormat|RelativeTimeFormat|Segmenter)\b/, 'Intl 新接口（Chrome 72+）'], [/\bBigInt\s*\(/, 'BigInt（Chrome 67）'],
  [/\.description\b.*Symbol|Symbol\([^)]*\)\.description/, 'Symbol.prototype.description（Chrome 70）'],
  [/\bnavigator\.audioSession\b/, 'navigator.audioSession（仅 iOS；Android 上没有，必须先判断）'],
  [/new\s+Worker\s*\(|\bSharedWorker\b|serviceWorker/, 'Worker / ServiceWorker（容器禁用）'],
  [/\bfetch\s*\(|new\s+XMLHttpRequest\b|new\s+WebSocket\b|new\s+EventSource\b/, '联网（fetch / XHR / WebSocket / SSE，容器禁用）'],
  [/\beval\s*\(|new\s+Function\s*\(|WebAssembly\./, 'eval / new Function / WebAssembly（容器禁用）'],
  [/requestFullscreen|webkitRequestFullscreen/, 'requestFullscreen（容器禁用，要先判断再用）'],
];

function* files(p) {
  const st = fs.statSync(p);
  if (st.isFile()) { yield p; return; }
  for (const n of fs.readdirSync(p)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    yield* files(path.join(p, n));
  }
}

function check(file, src) {
  const syn = [], rt = [];
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const at = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (n, msg) => syn.push([at(n), msg]);
  (function visit(n) {
    switch (n.kind) {
      case K.QuestionDotToken: add(n, '可选链 ?.（Chrome 80）'); break;
      case K.QuestionQuestionToken: add(n, '空值合并 ??（Chrome 80）'); break;
      case K.QuestionQuestionEqualsToken: case K.BarBarEqualsToken: case K.AmpersandAmpersandEqualsToken: add(n, '逻辑赋值 ??= ||= &&=（Chrome 85）'); break;
      case K.BigIntLiteral: add(n, 'BigInt 字面量（Chrome 67）'); break;
      case K.PrivateIdentifier: add(n, '私有字段 #x（Chrome 74）'); break;
      case K.PropertyDeclaration: add(n, '类字段（Chrome 72）'); break;
      case K.ClassStaticBlockDeclaration: add(n, '类静态块（Chrome 94）'); break;
      case K.CatchClause: if (!n.variableDeclaration) add(n, '可选 catch 绑定 catch {}（Chrome 66）'); break;
      case K.ForOfStatement: if (n.awaitModifier) add(n, 'for await（Chrome 63）'); break;
      case K.FunctionDeclaration: case K.FunctionExpression: case K.MethodDeclaration:
        if (n.asteriskToken && n.modifiers && n.modifiers.some((m) => m.kind === K.AsyncKeyword)) add(n, '异步生成器（Chrome 63）'); break;
      case K.NumericLiteral: if (/_/.test(n.getText(sf))) add(n, '数字分隔符 1_000（Chrome 75）'); break;
      case K.MetaProperty: if (n.keywordToken === K.ImportKeyword) add(n, 'import.meta（模块语法，Chrome 64）'); break;
      case K.CallExpression: if (n.expression.kind === K.ImportKeyword) add(n, '动态 import()（Chrome 63）'); break;
      case K.ImportDeclaration: case K.ExportDeclaration: case K.ExportAssignment: add(n, 'ES 模块 import / export（需要 type="module"，Chrome 61 对 module 脚本的支持有限，建议打成普通脚本）'); break;
      case K.RegularExpressionLiteral: {
        const t = n.getText(sf), m = t.match(/^\/(.*)\/([a-z]*)$/s);
        if (m) {
          if (/\(\?<[=!]/.test(m[1])) add(n, '正则后行断言（Chrome 62）');
          if (/\(\?<[A-Za-z_$]/.test(m[1])) add(n, '正则命名分组（Chrome 64）');
          if (/\\[pP]\{/.test(m[1])) add(n, '正则 \\p{} Unicode 属性（Chrome 64）');
          if (m[2].includes('s')) add(n, '正则 s 标志（Chrome 62）');
        }
        break;
      }
      default: break;
    }
    ts.forEachChild(n, visit);
  })(sf);
  // 接口：逐行扫（跳过纯注释行），报行号
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (!code.trim() || /^\s*\*/.test(line)) return;
    for (const [re, msg] of RUNTIME) if (re.test(code)) rt.push([i + 1, msg]);
  });
  if (sf.parseDiagnostics && sf.parseDiagnostics.length) {
    for (const d of sf.parseDiagnostics) syn.push([sf.getLineAndCharacterOfPosition(d.start).line + 1, '解析错误：' + ts.flattenDiagnosticMessageText(d.messageText, '\n')]);
  }
  return { syn, rt };
}

const targets = process.argv.slice(2);
if (!targets.length) { console.error('用法: node es2017_check.js <目录或文件> [...]'); process.exit(2); }
let nFiles = 0, nSyn = 0, nRt = 0;
const rtSummary = {}, synSummary = {};
for (const t of targets) {
  for (const f of files(t)) {
    if (!/\.js$/i.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (src.length > 3e6 && /^window\.[A-Z_]+\s*=\s*\{?\s*"data:|;base64,|^window\.APACK/.test(src.slice(0, 200))) { nFiles++; continue; }   // base64 数据包不是代码，跳过
    nFiles++;
    const { syn, rt } = check(f, src);
    for (const [l, m] of syn) { nSyn++; synSummary[m] = (synSummary[m] || 0) + 1; if (synSummary[m] <= 3) console.log(`[语法] ${f}:${l}  ${m}`); }
    for (const [l, m] of rt) { nRt++; rtSummary[m] = (rtSummary[m] || 0) + 1; if (rtSummary[m] <= 3) console.log(`[接口] ${f}:${l}  ${m}`); }
  }
}
console.log(`\n扫了 ${nFiles} 个 js 文件。[语法]问题 ${nSyn} 处，[接口]提示 ${nRt} 处（每类最多显示前 3 处）。`);
for (const [m, c] of Object.entries(synSummary)) console.log(`  语法  ${String(c).padStart(5)} × ${m}`);
for (const [m, c] of Object.entries(rtSummary)) console.log(`  接口  ${String(c).padStart(5)} × ${m}`);
process.exit(nSyn ? 1 : 0);
