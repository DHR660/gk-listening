/* 路由与页面骨架 */
'use strict';

const Views = {};
window.Views = Views;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, qs] = raw.split('?');
  const params = {};
  new URLSearchParams(qs || '').forEach((v, k) => { params[k] = v; });
  return { name: name || 'home', params };
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

const NAV = [
  { hash: '#/home', label: '首页', key: 'home' },
  { hash: '#/practice', label: '精听练习', key: 'practice' },
  { hash: '#/bank', label: '题库管理', key: 'bank' },
  { hash: '#/history', label: '学习数据', key: 'history' }
];

function shell(content, active) {
  const nav = NAV.map((n) => `<a href="${n.hash}" class="${active === n.key ? 'on' : ''}">${n.label}</a>`).join('');
  return `
  <header class="topbar">
    <div class="wrap">
      <div class="brand">
        <div class="logo">听</div>
        <div>高考英语听力 · 上机仿真练习
          <small>安徽 2026 外语听力改革 · 第一节短对话播放两遍</small>
        </div>
      </div>
      <nav class="nav">${nav}</nav>
    </div>
  </header>
  <main class="page"><div class="wrap">${content}</div></main>`;
}

let currentCleanup = null;

function setCleanup(fn) {
  currentCleanup = fn;
}

async function route() {
  const { name, params } = parseHash();
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (_) { /* ignore */ }
  }
  currentCleanup = null;
  document.body.classList.remove('exam-mode');
  const app = $('#app');
  app.innerHTML = '';
  const view = Views[name];
  if (!view) { go('#/home'); return; }
  try {
    await view(params, app);
  } catch (e) {
    console.error(e);
    app.innerHTML = shell(`<div class="card card-pad"><h3>页面出错</h3><p class="muted" style="margin-top:8px">${esc(e.message || e)}</p>
      <div class="row" style="margin-top:16px"><a class="btn btn-primary" href="#/home">返回首页</a></div></div>`, '');
  }
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ 启动 */

async function boot() {
  App.settings = loadSettings();
  document.documentElement.style.fontSize = App.settings.fontSize + 'px';

  try { App.status = await api.get('/api/status'); } catch (_) { App.status = {}; }
  try { await loadSets(); } catch (e) { console.warn('题库载入失败', e); }
  try { await loadRecords(); } catch (_) { /* ignore */ }

  // 考试中离开页面提醒
  window.addEventListener('beforeunload', (e) => {
    if (document.body.classList.contains('exam-running')) {
      e.preventDefault();
      e.returnValue = '考试尚未交卷，确定要离开吗？';
      return e.returnValue;
    }
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const mask = $('.modal-mask');
      if (mask) mask.remove();
    }
  });

  if (!location.hash) location.hash = '#/home';
  await route();
}

document.addEventListener('DOMContentLoaded', boot);
