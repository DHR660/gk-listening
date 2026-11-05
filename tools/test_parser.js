/* 解析器单元测试：node tools/test_parser.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'js', 'parser.js'), 'utf8');
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const P = ctx.window.Parser;

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass += 1; console.log('✓ ' + name + (extra ? '  ' + extra : '')); }
  else { fail += 1; console.log('✗ ' + name + (extra ? '  ' + extra : '')); }
}

/* 1. 内置模板 */
const r1 = P.parse(P.TEMPLATE, {});
check('模板：解析成功', r1.ok, r1.warnings && r1.warnings.join(' | '));
if (r1.ok) {
  const qs = r1.set.sections.flatMap((s) => s.materials.flatMap((m) => m.questions));
  check('模板：4 题', qs.length === 4, 'got ' + qs.length);
  check('模板：答案齐全', qs.every((q) => q.answer), qs.map((q) => q.no + q.answer).join(','));
  check('模板：第一节 2 段、第二节 1 段',
    r1.set.sections.length === 2 && r1.set.sections[0].materials.length === 2 && r1.set.sections[1].materials.length === 1,
    r1.set.sections.map((s) => s.name + ':' + s.materials.length).join(' '));
  check('模板：原文齐全', r1.set.sections.flatMap((s) => s.materials).every((m) => m.transcript.length > 30));
  check('模板：原文不含题号', !/\n\s*1\s*[.、]/.test(r1.set.sections[0].materials[0].transcript));
  check('模板：标题识别', /听力强化训练/.test(r1.set.title), r1.set.title);
}

/* 2. 试卷式（题目在前、原文在后） */
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sets', 'gk2024-xkb1.json'), 'utf8'));
const allMats = bank.sections.flatMap((s) => s.materials);
let paper = '# ' + bank.title + '\n\n第一部分 听力（共两节，满分 30 分）\n\n第一节\n';
allMats.forEach((m) => {
  m.questions.forEach((q) => {
    paper += '\n' + q.no + '. ' + q.text + '\n';
    ['A', 'B', 'C'].forEach((k) => { if (q.options[k]) paper += k + '. ' + q.options[k] + '\n'; });
  });
});
paper += '\n答案：' + allMats.flatMap((m) => m.questions).map((q) => q.no + '.' + q.answer).join(' ') + '\n';
paper += '\n听力原文\n';
allMats.forEach((m, i) => { paper += '\nText ' + (i + 1) + '\n' + m.transcript + '\n'; });

const r2 = P.parse(paper, {});
check('试卷式：解析成功', r2.ok, r2.warnings && r2.warnings.join(' | '));
if (r2.ok) {
  const qs = r2.set.sections.flatMap((s) => s.materials.flatMap((m) => m.questions));
  check('试卷式：20 题', qs.length === 20, 'got ' + qs.length);
  check('试卷式：答案 20 个', qs.filter((q) => q.answer).length === 20);
  check('试卷式：10 段材料', r2.set.sections.reduce((a, s) => a + s.materials.length, 0) === 10,
    r2.set.sections.map((s) => s.name + ':' + s.materials.length).join(' '));
  check('试卷式：原文齐全', r2.set.sections.flatMap((s) => s.materials).every((m) => m.transcript.length > 50));
  check('试卷式：第一节 5 段', r2.set.sections[0].materials.length === 5);
  check('试卷式：题号归位', qs.map((q) => q.no).join(',') === Array.from({ length: 20 }, (_, i) => i + 1).join(','));
  check('试卷式：分组 2/2/3/4/4',
    r2.set.sections[1].materials.map((m) => m.questions.length).join('/') === '2/2/3/4/4',
    r2.set.sections[1].materials.map((m) => m.questions.length).join('/'));
  check('试卷式：原文与题目对应',
    r2.set.sections[0].materials[0].transcript.slice(0, 20) === allMats[0].transcript.slice(0, 20));
}

/* 3. 无标点标题的纯题目 */
const r3 = P.parse('1. What is the man doing?\nA. Reading.\nB. Cooking.\nC. Running.\n答案: A\n', {});
check('单题：解析成功', r3.ok);
if (r3.ok) check('单题：1 题 1 答案', r3.set.sections.flatMap((s) => s.materials.flatMap((m) => m.questions)).length === 1);

/* 4. 题干内联选项 */
const r4 = P.parse('1. Where does the conversation take place? A. At a bank. B. At a hotel. C. At a school.\n答案: B\n', {});
if (r4.ok) {
  const q = r4.set.sections[0].materials[0].questions[0];
  check('内联选项：拆分正确', q.options.A && q.options.B && q.options.C && /conversation/.test(q.text), q.text);
}

/* 5. 答案区段式 */
const r5 = P.parse('1. Q1?\nA. a.\nB. b.\nC. c.\n2. Q2?\nA. a.\nB. b.\nC. c.\n答案：1-2 BA\n', {});
if (r5.ok) {
  const qs = r5.set.sections.flatMap((s) => s.materials.flatMap((m) => m.questions));
  check('区段答案：1.B 2.A', qs[0].answer === 'B' && qs[1].answer === 'A', qs.map((q) => q.answer).join(','));
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
