/* 精听练习 */
'use strict';

Views.practice = async function (params, app) {
  if (!App.sets.length) await loadSets();
  if (!params.set) {
    // 选择试卷
    app.innerHTML = shell(`
      <div class="section-title"><h2>精听练习</h2><span>逐段精听、对照原文、反复跟读</span></div>
      <div class="set-grid">
        ${App.sets.map((s) => `<button class="set-card" data-set="${esc(s.id)}" style="text-align:left;cursor:pointer;font-family:inherit">
          <h4>${esc(s.title)}</h4>
          <div class="tiny muted">${s.total} 题 · 音频 ${s.audioHave || 0}/${s.audioTotal || 0}</div>
          <div class="ops"><span class="btn btn-sm btn-primary">进入精听</span></div>
        </button>`).join('') || `<div class="card card-pad muted">题库为空，请先 <a href="#/bank?tab=import">导入材料</a>。</div>`}
      </div>`, 'practice');
    $$('[data-set]').forEach((b) => { b.onclick = () => go('#/practice?set=' + encodeURIComponent(b.dataset.set)); });
    return;
  }

  const set = getSet(params.set);
  if (!set) { go('#/practice'); return; }
  const mats = [];
  set.sections.forEach((sec) => sec.materials.forEach((m) => mats.push({ sec, m })));
  let cur = 0;
  if (params.mat) {
    const i = mats.findIndex((x) => x.m.id === params.mat);
    if (i >= 0) cur = i;
  }

  const P = { set, mats, cur, showAns: false, showScript: true, speed: 1, loop: false, picked: {} };
  const audio = new Audio();

  app.innerHTML = shell(`
    <div class="row" style="margin-bottom:10px">
      <a class="btn btn-sm" href="#/home">← 首页</a>
      <div class="spacer"></div>
      <span class="tiny muted">${esc(set.title)}</span>
    </div>
    <div class="practice-shell">
      <div class="mat-nav" id="p-nav"></div>
      <div id="p-main"></div>
    </div>`, 'practice');

  function paintNav() {
    $('#p-nav').innerHTML = mats.map((x, i) => `
      <button data-i="${i}" class="${i === P.cur ? 'on' : ''}">
        <span class="badge ${x.m.hasAudio ? 'ok' : 'warn'}" style="padding:1px 7px;font-size:11px">${x.m.hasAudio ? '♪' : '×'}</span>
        ${esc(x.m.label || x.m.id)}
        <span class="tiny muted" style="margin-left:auto">${x.sec.name.slice(-2)}</span>
      </button>`).join('');
    $$('#p-nav button').forEach((b) => {
      b.onclick = () => { P.cur = Number(b.dataset.i); load(); };
    });
  }

  function paintMain() {
    const { sec, m } = mats[P.cur];
    const qs = m.questions;
    const src = audioSrc(set, m);
    const effPlays = /第一节/.test(sec.name) ? (App.settings.examPlays || 2) : sec.plays;
    const qHtml = qs.map((q) => {
      const picked = P.picked[q.no];
      const opts = Object.keys(q.options).filter((k) => q.options[k]).map((k) => {
        let cls = picked === k ? 'on' : '';
        if (P.showAns) {
          if (k === q.answer) cls = 'right';
          else if (picked === k) cls = 'wrong';
          else cls = '';
        }
        return `<button class="opt ${cls}" data-q="${q.no}" data-k="${k}"><span class="k">${k}</span><span>${esc(q.options[k])}</span></button>`;
      }).join('');
      return `<div class="q-card" style="box-shadow:none;border:1px solid var(--line);margin-top:12px">
        <div class="q-head"><div class="q-no">${q.no}</div>
          <div class="tiny muted">${P.showAns ? '答案：<b style="color:#12a150">' + esc(q.answer) + '</b>' : '先听后选，再对答案'}</div></div>
        <div class="q-text">${esc(q.text)}</div>
        <div class="q-opts">${opts}</div>
      </div>`;
    }).join('');

    $('#p-main').innerHTML = `
      <div class="player-card">
        <div class="pc-row" style="margin-bottom:12px">
          <div>
            <div style="font-weight:800;font-size:16px">${esc(m.label || m.id)}</div>
            <div class="tiny" style="color:#93a9c9">${esc(sec.name)} · 第 ${qs[0] ? qs[0].no : ''}${qs.length > 1 ? '–' + qs[qs.length - 1].no : ''} 题 · 考试时每段 ${effPlays} 遍</div>
          </div>
          <div class="spacer"></div>
          ${m.hasAudio ? '' : `<a class="btn btn-sm" href="#/bank?tab=audio&set=${encodeURIComponent(set.id)}">补音频</a>`}
        </div>
        ${src ? '' : `<div class="inst-box" style="margin-bottom:12px;background:rgba(247,144,9,.14);border-color:rgba(247,144,9,.4);color:#ffd699">
          本段还没有音频：可到「题库管理 → 音频工作台」用原文一键生成配音，或上传听力书配套的 MP3。</div>`}
        <div class="pc-row">
          <button class="big-play" id="p-play">▶</button>
          <button class="btn btn-sm" id="p-restart" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15);color:#cfe0ff">↺ 重头</button>
          <div class="track" id="p-track"><i id="p-bar"></i></div>
          <span class="tiny mono" id="p-time" style="color:#93a9c9;min-width:82px;text-align:right">00:00 / 00:00</span>
        </div>
        <div class="pc-row" style="margin-top:12px">
          <span class="tiny" style="color:#93a9c9">倍速</span>
          <div class="speed-group" id="p-speed">
            ${[0.75, 1, 1.25, 1.5].map((v) => `<button data-v="${v}" class="${v === P.speed ? 'on' : ''}">${v}×</button>`).join('')}
          </div>
          <label class="tiny" style="color:#cfe0ff;display:flex;gap:6px;align-items:center;margin-left:8px">
            <input type="checkbox" id="p-loop" ${P.loop ? 'checked' : ''}> 单段循环</label>
          <div class="spacer"></div>
          <label class="tiny" style="color:#cfe0ff;display:flex;gap:6px;align-items:center">
            <input type="checkbox" id="p-script" ${P.showScript ? 'checked' : ''}> 显示原文</label>
          <label class="tiny" style="color:#cfe0ff;display:flex;gap:6px;align-items:center">
            <input type="checkbox" id="p-ans" ${P.showAns ? 'checked' : ''}> 显示答案</label>
        </div>
      </div>

      <div class="row" style="margin-top:14px;gap:8px">
        <button class="btn btn-sm" id="p-prev" ${P.cur === 0 ? 'disabled' : ''}>← 上一段</button>
        <button class="btn btn-sm" id="p-next" ${P.cur === mats.length - 1 ? 'disabled' : ''}>下一段 →</button>
        <div class="spacer"></div>
        <span class="tiny muted">第 ${P.cur + 1} / ${mats.length} 段</span>
      </div>

      <div class="card card-pad" style="margin-top:16px">
        <div class="card-h"><h3>题目</h3><div class="spacer"></div>
          <span class="tiny muted">${P.showAns ? '已显示答案' : '点击选项作答，再勾选"显示答案"核对'}</span></div>
        ${qHtml}
      </div>

      <div class="card card-pad" style="margin-top:16px">
        <div class="card-h"><h3>听力原文</h3><div class="spacer"></div>
          <button class="btn btn-sm" id="p-copy">复制原文</button></div>
        <div class="script-box" id="p-script-box" style="${P.showScript ? '' : 'display:none'}">${scriptHTML(m.transcript)}</div>
        ${P.showScript ? '' : '<p class="muted tiny">已隐藏原文（先盲听，听完再看）</p>'}
      </div>`;

    const playBtn = $('#p-play');
    const syncPlay = () => {
      playBtn.textContent = audio.paused ? '▶' : '⏸';
    };
    playBtn.onclick = async () => {
      if (!src) { toast('这段还没有音频，请先在题库里生成或上传', 'warn'); return; }
      if (!audio.src || audio.dataset.mat !== m.id) {
        audio.src = src;
        audio.dataset.mat = m.id;
      }
      if (audio.paused) {
        // 与考试一致：播放前先响一声提示音
        await Cue.play();
        audio.play();
      } else {
        audio.pause();
      }
    };
    $('#p-restart').onclick = () => { if (src) { audio.currentTime = 0; audio.play(); } };
    $('#p-prev').onclick = () => { P.cur -= 1; load(); };
    $('#p-next').onclick = () => { P.cur += 1; load(); };
    $$('#p-speed button').forEach((b) => {
      b.onclick = () => {
        P.speed = Number(b.dataset.v);
        audio.playbackRate = P.speed;
        $$('#p-speed button').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    $('#p-loop').onchange = (e) => { P.loop = e.target.checked; audio.loop = P.loop; };
    $('#p-script').onchange = (e) => { P.showScript = e.target.checked; paintMain(); };
    $('#p-ans').onchange = (e) => { P.showAns = e.target.checked; paintMain(); };
    $('#p-track').onclick = (e) => {
      if (!audio.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      audio.currentTime = (e.clientX - rect.left) / rect.width * audio.duration;
    };
    $$('.opt', $('#p-main')).forEach((b) => {
      b.onclick = () => { P.picked[Number(b.dataset.q)] = b.dataset.k; paintMain(); };
    });
    $('#p-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(m.transcript || ''); toast('原文已复制', 'ok'); }
      catch (_) { toast('复制失败，请手动选择文本', 'warn'); }
    };

    audio.playbackRate = P.speed;
    audio.loop = P.loop;
    syncPlay();
  }

  function updateTime() {
    const t = $('#p-time');
    const bar = $('#p-bar');
    if (!t || !bar) return;
    const d = audio.duration || 0;
    t.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(d || 0);
    bar.style.width = d ? (audio.currentTime / d * 100) + '%' : '0%';
  }

  audio.addEventListener('timeupdate', updateTime);
  audio.addEventListener('loadedmetadata', updateTime);
  audio.addEventListener('play', () => { const b = $('#p-play'); if (b) b.textContent = '⏸'; });
  audio.addEventListener('pause', () => { const b = $('#p-play'); if (b) b.textContent = '▶'; });
  audio.addEventListener('ended', () => { const b = $('#p-play'); if (b) b.textContent = '▶'; });

  function load() {
    const { m } = mats[P.cur];
    audio.pause();
    audio.dataset.mat = m.id;
    const src = audioSrc(set, m);
    audio.src = src || '';
    audio.playbackRate = P.speed;
    audio.loop = P.loop;
    paintNav();
    paintMain();
    updateTime();
    if (params.autoplay === '1' && src) audio.play().catch(() => {});
    params.autoplay = '0';
  }

  setCleanup(() => { audio.pause(); audio.src = ''; });
  load();
};
