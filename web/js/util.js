/* 工具函数与全局状态 */
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const App = (window.App = {
  sets: [],
  status: null,
  records: [],
  setCache: {},
  settings: null,
  version: '1.0.0'
});

/* ---------------------------------------------------------------- 基础函数 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
  return Math.floor(diff / 86400e3) + ' 天前';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function uid(prefix) {
  return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* ---------------------------------------------------------------- 提示条 */

function toast(msg, type, ms) {
  const box = $('#toast');
  const div = document.createElement('div');
  div.className = 'toast ' + (type || '');
  div.textContent = msg;
  box.appendChild(div);
  setTimeout(() => {
    div.style.transition = 'opacity .25s, transform .25s';
    div.style.opacity = '0';
    div.style.transform = 'translateY(6px)';
    setTimeout(() => div.remove(), 260);
  }, ms || (type === 'bad' ? 4200 : 2200));
}

/* ---------------------------------------------------------------- 弹窗 */

function modal(opts) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  const m = document.createElement('div');
  m.className = 'modal' + (opts.wide ? ' wide' : '');
  m.innerHTML = `
    <div class="m-head"><h3>${esc(opts.title || '')}</h3>
      <button class="x-btn" title="关闭">✕</button></div>
    <div class="m-body"></div>
    ${opts.footer !== false ? '<div class="m-foot"></div>' : ''}`;
  const body = $('.m-body', m);
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else if (opts.body instanceof Node) body.appendChild(opts.body);
  const foot = $('.m-foot', m);
  const close = () => mask.remove();
  $('.x-btn', m).onclick = close;
  mask.appendChild(m);
  $('#modal-root').appendChild(mask);
  mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });

  const api = { el: m, body, footer: foot, close, mask };
  (opts.actions || []).forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.onclick = () => { const r = a.onClick ? a.onClick(api) : undefined; if (r !== false && a.close !== false) close(); };
    foot.appendChild(b);
  });
  if (!(opts.actions || []).length && foot) foot.remove();
  return api;
}

function confirmDialog(title, msg, opts) {
  return new Promise((resolve) => {
    const o = opts || {};
    modal({
      title,
      body: `<p class="muted" style="line-height:1.75">${msg}</p>`,
      actions: [
        { label: o.cancelText || '取消', cls: '', onClick: () => resolve(false) },
        { label: o.okText || '确定', cls: o.danger ? 'btn-danger' : 'btn-primary', onClick: () => resolve(true) }
      ]
    });
    // 关闭（✕/遮罩）视为取消
    const mask = $('#modal-root').lastElementChild;
    const obs = new MutationObserver(() => {
      if (!mask.parentNode) { obs.disconnect(); resolve(false); }
    });
    obs.observe($('#modal-root'), { childList: true });
  });
}

/* ---------------------------------------------------------------- API */

async function apiFetch(url, opts) {
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

const api = {
  get: (u) => apiFetch(u),
  post: (u, body) => apiFetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  put: (u, body) => apiFetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  del: (u, body) => apiFetch(u, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
};

/* ---------------------------------------------------------------- 设置 */

const DEFAULT_SETTINGS = {
  fontSize: 16,
  engine: 'edge',
  maleVoice: 'en-US-GuyNeural',
  femaleVoice: 'en-US-JennyNeural',
  narratorVoice: 'zh-CN-XiaoxiaoNeural',
  rate: 0,
  gap: 0.35,
  autoPrompt: true,
  examPlays: 2,
  shortPlayTwice: true,
  hideAnswerWhileExam: true,
  showScriptAfterExam: true,
  readSec: 120,
  reviewSec: 120,
  answerSec: 5,
  cueSound: true
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('gk.settings') || '{}'); } catch (_) { s = {}; }
  const merged = Object.assign({}, DEFAULT_SETTINGS, s || {});
  // 旧版本用的是 extraAnswerSec（每段额外作答），现在统一为 answerSec（每段录音结束共 5 秒）
  if (s && s.extraAnswerSec != null && s.answerSec == null) merged.answerSec = 5;
  return merged;
}

function saveSettings(patch) {
  App.settings = Object.assign({}, App.settings, patch || {});
  localStorage.setItem('gk.settings', JSON.stringify(App.settings));
  document.documentElement.style.fontSize = App.settings.fontSize + 'px';
}

/* ---------------------------------------------------------------- 数据 */

async function loadSets(force) {
  App.sets = await api.get('/api/sets');
  App.setCache = {};
  App.sets.forEach((s) => { App.setCache[s.id] = s; });
  return App.sets;
}

function getSet(id) {
  return App.setCache[id] || App.sets.find((s) => s.id === id) || null;
}

async function loadRecords() {
  try { App.records = await api.get('/api/records'); } catch (_) { App.records = []; }
  return App.records;
}

/** 把一套试卷拍平成题目数组 */
function flatten(set) {
  const out = [];
  if (!set) return out;
  set.sections.forEach((sec, si) => {
    sec.materials.forEach((m, mi) => {
      m.questions.forEach((q, qi) => {
        out.push({ no: q.no, secIndex: si, matIndex: mi, qIndex: qi, sec, mat: m, q });
      });
    });
  });
  out.sort((a, b) => a.no - b.no);
  return out;
}

function materialQuestions(set, matId) {
  const res = [];
  set.sections.forEach((sec) => sec.materials.forEach((m) => {
    if (m.id === matId) m.questions.forEach((q) => res.push(q));
  }));
  return res;
}

function audioSrc(set, m) {
  if (!m) return '';
  if (m.audio) return m.audio;
  return '';
}

function scoreOf(set, answers) {
  const qs = flatten(set);
  let right = 0;
  const detail = [];
  qs.forEach((it) => {
    const mine = answers[it.no] || '';
    const ok = !!mine && mine === it.q.answer;
    if (ok) right += 1;
    detail.push({ no: it.no, mine, ans: it.q.answer, ok });
  });
  const per = Number(set.scorePerQuestion) || 1.5;
  return { total: qs.length, right, score: +(right * per).toFixed(1), full: +(qs.length * per).toFixed(1), detail };
}

/** 错题本（本地） */
const WrongBook = {
  key: 'gk.wrong',
  all() {
    try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch (_) { return {}; }
  },
  add(set, detail) {
    const book = this.all();
    detail.filter((d) => !d.ok).forEach((d) => {
      const k = set.id + '#' + d.no;
      const rec = book[k] || { setId: set.id, setName: set.title, no: d.no, mine: '', ans: d.ans, count: 0 };
      rec.count += 1;
      rec.mine = d.mine || rec.mine;
      rec.lastAt = Date.now();
      book[k] = rec;
    });
    localStorage.setItem(this.key, JSON.stringify(book));
    return book;
  },
  list() {
    return Object.values(this.all()).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  },
  remove(setId, no) {
    const book = this.all();
    delete book[setId + '#' + no];
    localStorage.setItem(this.key, JSON.stringify(book));
  },
  clear() { localStorage.removeItem(this.key); }
};

/* ---------------------------------------------------------------- 试音 */

let audioCtx = null;

function beep(freq, ms, vol) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq || 880;
    g.gain.value = vol == null ? 0.1 : vol;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + (ms || 200) / 1000);
  } catch (_) { /* 忽略 */ }
}

/** 试音：优先播放题库里的示例音频，其次用系统语音读出示范句 */
function playTestTone() {
  if (!('speechSynthesis' in window)) { beep(880, 260); return Promise.resolve(); }
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance('This is a sound test. Please make sure you can hear this clearly.');
    u.lang = 'en-US';
    u.rate = 0.95;
    const vs = speechSynthesis.getVoices().filter((v) => /en[-_]/i.test(v.lang));
    if (vs.length) u.voice = vs.find((v) => /zira|jenny|aria|samantha/i.test(v.name)) || vs[0];
    u.onend = () => resolve();
    u.onerror = () => { beep(880, 260); resolve(); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setTimeout(resolve, 6000);
  });
}

/** 读取音频时长（秒）；失败返回 0 */
function probeAudio(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(0);
    const a = new Audio();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      a.removeAttribute('src');
      resolve(v || 0);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => finish(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => finish(0);
    setTimeout(() => finish(isFinite(a.duration) ? a.duration : 0), 5000);
    a.src = url;
  });
}

/* ---------------------------------------------------------- 考试提示音 */

/** 合成版"叮—咚"：没有 _cue.wav 时兜底 */
function chimeSynth() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const note = (freq, t0, dur, amp) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + t0);
      g.gain.exponentialRampToValueAtTime(amp, now + t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(now + t0);
      o.stop(now + t0 + dur + 0.05);
    };
    note(1046.5, 0, 0.55, 0.20);
    note(784.0, 0.42, 0.90, 0.17);
  } catch (_) {
    beep(880, 200);
  }
}

/** 每段录音前的提示音：优先播放 data/audio/_cue.wav（真实的"叮咚"铃声） */
const Cue = {
  el: null,
  broken: false,
  play() {
    if (App.settings && App.settings.cueSound === false) return Promise.resolve();
    return new Promise((resolve) => {
      if (this.broken) { chimeSynth(); setTimeout(resolve, 480); return; }
      if (!this.el) {
        this.el = new Audio('/audio/_cue.wav');
        this.el.preload = 'auto';
      }
      const a = this.el;
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        a.onended = null;
        a.onerror = null;
        resolve();
      };
      try { a.currentTime = 0; } catch (_) { /* ignore */ }
      a.onended = fin;
      a.onerror = () => { this.broken = true; chimeSynth(); setTimeout(fin, 500); };
      const p = a.play();
      if (p && p.catch) p.catch(() => { this.broken = true; chimeSynth(); setTimeout(fin, 500); });
      setTimeout(fin, 3500);
    });
  }
};
window.Cue = Cue;

/* ---------------------------------------------------------------- 杂项 */

function speakerSpan(line) {
  const m = /^\s*([A-Za-z][A-Za-z.\s]{0,12}?)\s*[:：]\s*(.*)$/.exec(line);
  if (!m) return { who: '', text: line };
  return { who: m[1].trim(), text: m[2].trim() };
}

function scriptHTML(transcript) {
  const lines = String(transcript || '').split('\n').filter((l) => l.trim());
  if (!lines.length) return '<span class="muted">（缺少听力原文）</span>';
  return lines.map((l) => {
    const s = speakerSpan(l);
    return s.who
      ? `<div><span class="spk">${esc(s.who)}:</span> ${esc(s.text)}</div>`
      : `<div>${esc(l)}</div>`;
  }).join('');
}

function badgen(text, cls) {
  return `<span class="badge ${cls || ''}">${esc(text)}</span>`;
}

function setTitle(title, sub) {
  document.title = title ? title + ' · 听力练习系统' : '高考英语听力 · 上机仿真练习系统';
  void sub;
}
