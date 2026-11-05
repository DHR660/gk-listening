/* 题库结构校验：node tools/validate_sets.js [id ...]
 * 不给参数则校验 data/sets 下全部 json。
 * 校验项：题号连续 1-20、小节/材料个数、选项与答案、原文为纯英文、重复检测等。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'data', 'sets');
const CJK = /[\u4e00-\u9fff]/;

function expect(cond, msg, errs) {
  if (!cond) errs.push(msg);
}

function checkSet(file, all) {
  const errs = [];
  let s;
  try {
    s = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  } catch (e) {
    return { file, errs: ['JSON 解析失败: ' + e.message] };
  }
  expect(s.id === file.replace(/\.json$/, ''), `id(${s.id}) 与文件名不一致`, errs);
  expect(typeof s.title === 'string' && s.title.trim().length > 3, '缺少标题', errs);
  expect(Array.isArray(s.sections) && s.sections.length === 2, '必须正好两节', errs);
  const sec1 = s.sections && s.sections[0];
  const sec2 = s.sections && s.sections[1];
  if (sec1) {
    expect(sec1.name === '第一节', '第一节 name 应为"第一节"', errs);
    expect([1, 2].includes(Number(sec1.plays)), '第一节 plays 应为 1 或 2', errs);
    expect(Array.isArray(sec1.materials) && sec1.materials.length === 5, '第一节应有 5 段材料', errs);
    (sec1.materials || []).forEach((m, i) => {
      expect(Array.isArray(m.questions) && m.questions.length === 1, `第一节第 ${i + 1} 段应有 1 题`, errs);
    });
  }
  if (sec2) {
    expect(sec2.name === '第二节', '第二节 name 应为"第二节"', errs);
    expect(Number(sec2.plays) === 2, '第二节 plays 应为 2', errs);
    expect(Array.isArray(sec2.materials) && sec2.materials.length === 5, '第二节应有 5 段材料', errs);
    const counts = (sec2.materials || []).map((m) => (m.questions || []).length);
    expect(counts.reduce((a, b) => a + b, 0) === 15, `第二节应共 15 题（当前 ${counts.join('+')}）`, errs);
    counts.forEach((c, i) => expect(c >= 1 && c <= 4, `第二节第 ${i + 1} 段题数异常（${c}）`, errs));
  }

  const mats = (s.sections || []).flatMap((x) => x.materials || []);
  const qs = mats.flatMap((m) => m.questions || []);
  expect(qs.length === 20, `总题数应为 20（当前 ${qs.length}）`, errs);
  const nos = qs.map((q) => q.no).sort((a, b) => a - b);
  expect(nos.length === 20 && nos.every((n, i) => n === i + 1), `题号应为 1-20 连续（当前 ${nos.join(',')}）`, errs);

  qs.forEach((q) => {
    expect(typeof q.text === 'string' && q.text.trim().length > 5, `第 ${q.no} 题题干为空`, errs);
    ['A', 'B', 'C'].forEach((k) => {
      expect(typeof q.options[k] === 'string' && q.options[k].trim().length > 0, `第 ${q.no} 题缺选项 ${k}`, errs);
    });
    expect(['A', 'B', 'C'].includes(q.answer), `第 ${q.no} 题答案非法（${q.answer}）`, errs);
    expect(!q.options[q.answer] || !/^\s*$/.test(q.options[q.answer]), `第 ${q.no} 题答案指向空选项`, errs);
  });

  mats.forEach((m, i) => {
    const t = (m.transcript || '').trim();
    expect(t.length > 0, `第 ${i + 1} 段缺原文`, errs);
    expect(!CJK.test(t), `第 ${i + 1} 段原文含中文`, errs);
    if (i < 5) expect(t.length >= 30, `第 ${i + 1} 段（第一节）原文过短`, errs);
    else {
      expect(t.length >= 200, `第 ${i + 1} 段（第二节）原文过短（<200 字符）`, errs);
      expect(/^\s*(M|W|Man|Woman|Narrator)\s*[:：]/im.test(t) || i === 9, `第 ${i + 1} 段缺少 M:/W: 说话人标记`, errs);
    }
  });

  // 答案分布
  const dist = { A: 0, B: 0, C: 0 };
  qs.forEach((q) => { if (dist[q.answer] != null) dist[q.answer] += 1; });
  const maxShare = Math.max(dist.A, dist.B, dist.C) / Math.max(1, qs.length);
  expect(maxShare <= 0.55, `答案分布过于集中（A${dist.A} B${dist.B} C${dist.C}）`, errs);

  // 套内题干重复
  const texts = qs.map((q) => q.text.toLowerCase().replace(/\W+/g, ''));
  expect(new Set(texts).size === texts.length, '套内存在重复题干', errs);

  // 与其它套重复（原文 MD5）
  const h = crypto.createHash('md5').update(mats.map((m) => m.transcript).join('|')).digest('hex').slice(0, 10);
  if (all[h]) errs.push(`与 ${all[h]} 原文完全相同（重复套）`);
  else all[h] = file;

  return { file, errs, id: s.id, total: qs.length, words: mats.reduce((a, m) => a + (m.transcript || '').split(/\s+/).filter(Boolean).length, 0) };
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((x) => (x.endsWith('.json') ? x : x + '.json'))
  : fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

const all = {};
let bad = 0;
files.forEach((f) => {
  const r = checkSet(f, all);
  if (r.errs.length) {
    bad += 1;
    console.log('✗ ' + r.file);
    r.errs.forEach((e) => console.log('    - ' + e));
  } else {
    console.log(`✓ ${r.file}  ${r.total} 题  ${r.words} 词`);
  }
});
console.log(`\n${files.length - bad}/${files.length} 通过`);
process.exit(bad ? 1 : 0);
