/* 生成题库清单：node tools/gen_manifest.js  → 题库清单.md */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'sets');
const isMock = (s) => String(s.id).indexOf('mock') === 0 || /模拟|仿真/.test(s.exam || '');

const sets = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
  const s = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const mats = s.sections.flatMap((x) => x.materials);
  const qs = mats.flatMap((m) => m.questions);
  const audioDir = path.join(ROOT, 'data', 'audio', s.id);
  let audioCount = 0;
  try { audioCount = fs.readdirSync(audioDir).filter((n) => n.endsWith('.mp3') && !n.includes('.prompt.')).length; } catch (_) { audioCount = 0; }
  sets.push({
    id: s.id, title: s.title, year: s.year || '', exam: s.exam || '',
    mock: isMock(s), ans: qs.map((q) => q.answer).join(''),
    plays: s.sections.map((x) => `${x.name}：${x.plays} 遍`).join('；'),
    words: mats.reduce((a, m) => a + (m.transcript || '').split(/\s+/).filter(Boolean).length, 0),
    mats: mats.length, audio: audioCount,
    src: s.source || '', asrc: s.answerSource || '', note: s.note || ''
  });
}
sets.sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.id).localeCompare(String(b.id)));

const real = sets.filter((s) => !s.mock);
const mock = sets.filter((s) => s.mock);

function table(list) {
  let md = '| # | 试卷 | 年份 | 卷别 | 原文词数 | 答案（1–20） | 播放 |\n|---|---|---|---|---|---|---|\n';
  list.forEach((r, i) => {
    md += `| ${i + 1} | ${r.title} | ${r.year} | ${r.exam} | ${r.words} | \`${r.ans}\` | ${r.plays} |\n`;
  });
  return md;
}

let md = '# 内置题库清单\n\n';
md += `共 **${sets.length} 套**（真题 ${real.length} 套 + 模拟题 ${mock.length} 套），每套 20 题、30 分、两节。\n`;
md += '音频放在 `data/audio/<试卷id>/`：每段材料 1 个 MP3 + 1 个中文指令音（`<材料id>.prompt.mp3`）。\n\n';

md += `## 一、真题（${real.length} 套）\n\n` + table(real);
md += `\n## 二、模拟题（${mock.length} 套）\n\n` + table(mock);

md += '\n## 三、来源与备注\n\n';
sets.forEach((r) => {
  md += `### ${r.id} · ${r.title}\n`;
  md += `- 类型：${r.mock ? '模拟题' : '真题'}　原文 ${r.words} 词　音频 ${r.audio}/${r.mats} 段\n`;
  if (r.src) md += `- 文字来源：${r.src}\n`;
  if (r.asrc && r.asrc !== r.src) md += `- 答案来源：${r.asrc}\n`;
  if (r.note) md += `- 备注：${r.note}\n`;
  md += '\n';
});
md += '> 真题的题目、选项、答案与听力原文来自公开网络上的高考真题资料；模拟题为按 2026 高考听力题型编写/改编的练习材料。\n';
md += '> 2022—2025 真题原卷第一节只读一遍，本系统默认按 2026 新规读两遍，可在「考生信息」页一键切回 1 遍。\n';
md += '> 全部音频由 edge-tts 依据原文合成（男女声分角色），非官方录音，仅用于个人学习练习。\n';

fs.writeFileSync(path.join(ROOT, '题库清单.md'), md, 'utf8');
console.log(`题库清单.md 已生成：${sets.length} 套（真题 ${real.length} / 模拟 ${mock.length}）`);
