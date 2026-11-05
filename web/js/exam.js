/* 考前流程 + 考试引擎（阅卷 → 听音作答 → 检查修改） */
'use strict';

/* ============================================================ 工具 */

function secPlays(sec) { return Number(sec.plays) === 1 ? 1 : 2; }

/** 按音频 + 停顿规则估算"听力播放"用时（不含阅卷/检查） */
function estimateListening(sections, answerSec) {
  const ans = Math.max(0, Number(answerSec) || 0);
  let t = 0;
  sections.forEach((sec) => {
    t += 2.2;
    sec.materials.forEach((m) => {
      const n = m.questions.length;
      const plays = secPlays(sec);
      t += 0.3 + (m.promptDur || 0);
      t += 1.55 * plays + 0.26 * plays; // 每遍前的提示音
      t += (m.duration || 0) * plays + 2.6 * (plays - 1);
      t += 5 * n; // 听前读题：每题 5 秒
      t += ans;
    });
  });
  return Math.round(t);
}

/* ============================================================ 考前（试音/须知） */

Views.pre = async function (params, app) {
  const set = getSet(params.set);
  if (!set) { go('#/home'); return; }
  const mode = params.mode || 'full';
  let sections = (mode === 'full' ? set.sections : set.sections.filter((s, i) => 'sec' + i === mode)).map((s) => Object.assign({}, s));
  let s1 = Number(params.s1) === 1 ? 1 : 2;
  if (/第一节/.test((sections[0] || {}).name || '')) sections[0].plays = s1;
  const qcount = sections.reduce((a, s) => a + s.materials.reduce((b, m) => b + m.questions.length, 0), 0);
  const missing = [];
  sections.forEach((s) => s.materials.forEach((m) => { if (!m.hasAudio) missing.push(m.id); }));

  const READ = Math.max(0, Number(App.settings.readSec) || 0);
  const REVIEW = Math.max(0, Number(App.settings.reviewSec) || 0);
  const ANSWER = Math.max(1, Number(App.settings.answerSec) || 5);

  // 读取音频时长 → 估算听力时长
  const allMats = sections.flatMap((s) => s.materials.map((m) => ({ sec: s, m })));
  let listenSec = 0;
  let lastKey = '';
  async function refreshEstimate() {
    const key = sections.map((s) => s.plays).join(',');
    if (key === lastKey && listenSec) { renderTimes(); return; }
    lastKey = key;
    const durs = await Promise.all(allMats.map((x) => probeAudio(audioSrc(set, x.m))));
    const prompts = await Promise.all(allMats.map((x) => probeAudio(x.m.promptAudio || '')));
    let t = 0;
    allMats.forEach((x, i) => {
      x.m.duration = durs[i] || 0;
      x.m.promptDur = prompts[i] || 0;
      const n = x.m.questions.length;
      const plays = secPlays(x.sec);
      t += 0.3 + x.m.promptDur;
      t += 1.55 * plays + 0.26 * plays; // 每遍前的提示音
      t += x.m.duration * plays + 2.6 * (plays - 1);
      t += 5 * n; // 听前读题：每题 5 秒
      t += ANSWER;
    });
    t += 2.2 * sections.length;
    listenSec = Math.round(t);
    renderTimes();
  }

  function renderTimes() {
    const el = $('#p-times');
    if (!el) return;
    const total = READ + listenSec + REVIEW + 30;
    const mm = Math.floor(total / 60);
    const ss = String(total % 60).padStart(2, '0');
    const ls = listenSec ? Math.floor(listenSec / 60) + ' 分 ' + String(listenSec % 60).padStart(2, '0') + ' 秒' : '—';
    el.innerHTML = `
      <tr><th>阅卷时间</th><td>${READ ? READ + ' 秒' : '无'}：开考前可阅读<b>全部题目</b>（只看题干与选项，不能作答）</td></tr>
      <tr><th>听力播放</th><td>约 <b>${ls}</b>（按实际音频计算；每遍录音前有提示音，每段结束留 <b>${ANSWER}</b> 秒作答）</td></tr>
      <tr><th>检查修改</th><td>${REVIEW ? REVIEW + ' 秒' : '无'}：录音结束后可查看并修改<b>全部答案</b></td></tr>
      <tr><th>预计总时长</th><td>约 <b>${mm} 分 ${ss} 秒</b>（以录音结束为准）</td></tr>`;
  }

  let pageAudio = null;
  let step = 1;
  let name = localStorage.getItem('gk.name') || '';
  let no = localStorage.getItem('gk.no') || '';

  app.innerHTML = shell(`
    <div class="pre-shell">
      <div class="row" style="margin-bottom:16px">
        <a class="btn btn-sm" href="#/home">← 返回</a>
        <div class="spacer"></div>
        <span class="tiny muted">${esc(set.title)}</span>
      </div>
      <div class="stepper">
        <div class="s on" data-s="1"><i>1</i>考生信息</div>
        <div class="s" data-s="2"><i>2</i>设备试音</div>
        <div class="s" data-s="3"><i>3</i>考试须知</div>
      </div>
      <div id="pre-body"></div>
    </div>`, '');

  const body = $('#pre-body');

  function paint() {
    $$('.stepper .s').forEach((el) => {
      const n = Number(el.dataset.s);
      el.classList.toggle('on', n === step);
      el.classList.toggle('done', n < step);
    });

    if (step === 1) {
      body.innerHTML = `
        <div class="card card-pad">
          <div class="card-h"><h3>考生信息</h3></div>
          <div class="row" style="gap:14px;align-items:flex-start">
            <label class="field" style="flex:1"><span>姓名</span>
              <input type="text" id="p-name" placeholder="输入姓名" value="${esc(name)}"></label>
            <label class="field" style="flex:1"><span>准考证号（选填）</span>
              <input type="text" id="p-no" placeholder="输入考号" value="${esc(no)}"></label>
          </div>
          <div class="hr"></div>
          <table class="tbl">
            <tr><th>试卷</th><td>${esc(set.title)}</td></tr>
            <tr><th>考试范围</th><td>${mode === 'full' ? '完整听力（第一节 + 第二节）' : esc(sections[0].name)}</td></tr>
            <tr><th>小题数</th><td>${qcount} 题</td></tr>
            <tr><th>分值</th><td>${qcount} × ${set.scorePerQuestion || 1.5} = <b>${(qcount * (set.scorePerQuestion || 1.5)).toFixed(1)} 分</b></td></tr>
            <tr><th>第一节遍数</th><td>
              <select id="p-s1" style="max-width:260px;display:inline-block">
                <option value="2" ${s1 === 2 ? 'selected' : ''}>每段 2 遍（2026 改革新规，推荐）</option>
                <option value="1" ${s1 === 1 ? 'selected' : ''}>每段 1 遍（2025 年及以前真题原样）</option>
              </select></td></tr>
            <tr><th>第二节遍数</th><td>每段 ${(sections.find((x) => /第二节/.test(x.name)) || { plays: 2 }).plays} 遍</td></tr>
          </table>
          <div class="hr"></div>
          <table class="tbl" id="p-times">
            <tr><th>阅卷时间</th><td>正在读取音频…</td></tr>
          </table>
          ${missing.length ? `<div class="inst-box" style="margin-top:16px;color:#8a5300;background:#fff8e8;border-color:#f5d9a8">
            ⚠️ 有 ${missing.length} 段材料缺少音频，考试时会自动跳过（无声）。建议先到「题库管理 → 音频工作台」生成或上传音频。</div>` : ''}
          <div class="row" style="margin-top:20px;justify-content:flex-end">
            <button class="btn btn-primary" id="p-next">下一步：设备试音</button>
          </div>
        </div>`;
      $('#p-s1').onchange = (e) => {
        name = $('#p-name').value;
        no = $('#p-no').value;
        s1 = Number(e.target.value) === 1 ? 1 : 2;
        saveSettings({ examPlays: s1 });
        if (/第一节/.test((sections[0] || {}).name || '')) sections[0].plays = s1;
        paint();
      };
      refreshEstimate();
      $('#p-next').onclick = () => {
        localStorage.setItem('gk.name', $('#p-name').value.trim());
        localStorage.setItem('gk.no', $('#p-no').value.trim());
        step = 2; paint();
      };
    }

    if (step === 2) {
      body.innerHTML = `
        <div class="card card-pad">
          <div class="card-h"><h3>设备检测与试音</h3><div class="spacer"></div>
            <span class="badge blue">建议佩戴有线耳机</span></div>
          <p class="muted tiny" style="margin-bottom:14px">真实机考中，请调整耳机音量至"能清晰听到、旁边同学听不到"。开考后<b>无法调节界面音量</b>，请先在本机把系统音量调好。</p>
          <div class="row" style="gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" id="p-test">🔊 高考试音（经典版）</button>
            <button class="btn" id="p-test26">🔊 高考试音（2026 新版）</button>
            <button class="btn" id="p-cue">🔔 只听提示音</button>
            <div class="spacer"></div>
            <span class="tiny muted" id="p-status">未播放</span>
          </div>
          <p class="tiny muted" style="margin-top:8px">经典版＝2025 及以前的"九磅十五便士"例题录音；2026 年起该例题已取消，新版为中文提示 + 英文试音句。两种都听一遍，确认左右耳都清楚。</p>
          <div style="margin-top:16px">
            <div class="tiny muted" style="margin-bottom:6px">耳机 / 音量自检</div>
            <div class="volume-meter"><i id="p-meter"></i></div>
          </div>
          <div class="hr"></div>
          <label class="row" style="gap:10px;font-size:14.5px">
            <input type="checkbox" id="p-heard"> <span>我已在耳机中<b>清晰听到</b>试音与提示音（左/右耳都有声音）</span>
          </label>
          <div class="row" style="margin-top:20px;justify-content:space-between">
            <button class="btn" id="p-back">上一步</button>
            <button class="btn btn-primary" id="p-next" disabled>下一步：考试须知</button>
          </div>
        </div>`;
      const meter = $('#p-meter');
      const setMeter = (v) => { if (meter) meter.style.width = Math.max(2, Math.min(100, v)) + '%'; };
      const setStatus = (t) => { const el = $('#p-status'); if (el) el.textContent = t; };
      const playTestAudio = async (kind) => {
        const url = kind === 'classic' ? '/audio/_test_classic.mp3' : '/audio/_test_2026.mp3';
        if (pageAudio) { try { pageAudio.pause(); } catch (_) { /* ignore */ } }
        setStatus(kind === 'classic' ? '正在播放：高考试音（经典版）…' : '正在播放：高考试音（2026 新版）…');
        let p = 0;
        const timer = setInterval(() => { p = (p + 7) % 100; setMeter(p + 25); }, 90);
        let ok = false;
        try {
          const a = new Audio(url);
          pageAudio = a;
          await Cue.play();
          a.preload = 'auto';
          await new Promise((resolve) => {
            a.onended = resolve;
            a.onerror = resolve;
            a.play().then(() => { ok = true; }).catch(resolve);
            setTimeout(resolve, 70000);
          });
        } catch (_) { ok = false; }
        clearInterval(timer);
        setMeter(ok ? 62 : 40);
        if (!ok) {
          await playTestTone();
          setStatus('试音音频缺失，已用系统语音代替（可重新生成：py tools/make_test_audio.py）');
        } else {
          setStatus('试音播放完毕');
        }
      };
      $('#p-test').onclick = () => playTestAudio('classic');
      $('#p-test26').onclick = () => playTestAudio('new');
      $('#p-cue').onclick = async () => {
        setStatus('每一遍录音开始前都会响一次提示音');
        setMeter(50);
        await Cue.play();
      };
      $('#p-heard').onchange = () => { $('#p-next').disabled = !$('#p-heard').checked; };
      $('#p-back').onclick = () => { step = 1; paint(); };
      $('#p-next').onclick = () => { step = 3; paint(); };
    }

    if (step === 3) {
      const secRules = sections.map((s) => `<li><b>${esc(s.name)}：</b>${esc(s.desc)}</li>`).join('');
      body.innerHTML = `
        <div class="card card-pad">
          <div class="card-h"><h3>考试须知</h3></div>
          <ul class="notice-list">
            <li>本场共 <b>${qcount}</b> 小题，满分 <b>${(qcount * (set.scorePerQuestion || 1.5)).toFixed(0)}</b> 分，按机考流程进行。</li>
            <li><b>阅卷 ${READ} 秒：</b>开考前可以浏览全部题目（题干与选项），提前熟悉话题；此时不能作答。</li>
            <li><b>听前读题：</b>每段录音开始前，<b>每道题给 5 秒</b>读题干与选项（第一节 1 题 = 5 秒，第二节 2–4 题 = 10–20 秒）。</li>
            <li><b>逐段播放：</b>先播放中文指令，然后<b>每一遍录音开始前都响一声提示音 🔔</b>；第一节每段读 ${sections[0].plays} 遍，第二节每段读 2 遍。</li>
            <li><b>只看本段：</b>录音播放期间，屏幕上只显示<b>当前这一段材料</b>的题目；本段录音结束、下一段开始时，自动跳到下一段的题目。</li>
            <li><b>作答时间：</b>每段录音结束后有 <b>${ANSWER} 秒</b>作答时间，请及时点选答案；播放期间不能暂停、不能回听。</li>
            <li><b>检查 ${REVIEW} 秒：</b>全部录音播完后，可以查看并修改前面所有题目的答案，倒计时结束自动收卷。</li>
            <li>请勿刷新页面或关闭窗口；离开页面会被记录，成绩单上会显示离开次数。</li>
          </ul>
          <label class="row" style="gap:10px;margin-top:18px;font-size:14.5px">
            <input type="checkbox" id="p-read"> <span>我已阅读并同意上述考试规则</span>
          </label>
          <div class="row" style="margin-top:20px;justify-content:space-between">
            <button class="btn" id="p-back">上一步</button>
            <button class="btn btn-primary btn-lg" id="p-start" disabled>开始考试</button>
          </div>
        </div>`;
      $('#p-read').onchange = () => { $('#p-start').disabled = !$('#p-read').checked; };
      $('#p-back').onclick = () => { step = 2; paint(); };
      $('#p-start').onclick = () => startCountdown(() => go(`#/exam?set=${encodeURIComponent(set.id)}&mode=${mode}&s1=${s1}&dur=${listenSec || 0}`));
    }
  }

  setCleanup(() => {
    try {
      if (pageAudio) { pageAudio.pause(); pageAudio.src = ''; pageAudio = null; }
    } catch (_) { /* ignore */ }
  });

  paint();
};

function startCountdown(done) {
  const div = document.createElement('div');
  div.className = 'countdown';
  div.innerHTML = '<div><div class="num">3</div><div class="muted" style="color:#8fb2e8;margin-top:14px;font-size:15px">请勿交头接耳，考试即将开始</div></div>';
  document.body.appendChild(div);
  let n = 3;
  const num = $('.num', div);
  const tick = () => {
    if (n === 0) { div.remove(); done(); return; }
    num.textContent = n;
    beep(880, 120, 0.1);
    n -= 1;
    setTimeout(tick, 800);
  };
  tick();
}

/* ============================================================ 考试引擎 */

Views.exam = async function (params, app) {
  const set = getSet(params.set);
  if (!set) { go('#/home'); return; }
  const mode = params.mode || 'full';
  let sections = (mode === 'full' ? set.sections : set.sections.filter((s, i) => 'sec' + i === mode)).filter((s) => s.materials.length);
  if (!sections.length) { go('#/home'); return; }
  sections = sections.map((s) => Object.assign({}, s));
  const s1Plays = Number(params.s1) === 1 ? 1 : (Number(params.s1) === 2 ? 2 : (App.settings.examPlays || 2));
  if (/第一节/.test(sections[0].name)) sections[0].plays = s1Plays === 1 ? 1 : 2;

  const READ = Math.max(0, Number(App.settings.readSec) || 0);
  const REVIEW = Math.max(0, Number(App.settings.reviewSec) || 0);
  const ANSWER = Math.max(1, Number(App.settings.answerSec) || 5);

  const items = [];
  sections.forEach((sec) => sec.materials.forEach((m) => m.questions.forEach((q) => {
    items.push({ no: q.no, sec, mat: m, q });
  })));

  const listenEst = Number(params.dur) > 0 ? Number(params.dur) : estimateListening(sections, ANSWER);

  const E = {
    set, sections, items, mode,
    answers: {},
    idx: 0,
    phase: 'reading',
    left: READ,
    remain: listenEst + 30,
    matId: '',
    playNo: 0,
    finished: false,
    abort: false,
    blurred: 0,
    startedAt: Date.now(),
    audio: new Audio(),
    tick: null
  };
  E.audio.preload = 'auto';

  document.body.classList.add('exam-mode', 'exam-running');
  app.innerHTML = `
    <div class="exam-shell">
      <div class="exam-top">
        <div class="t-name">${esc(set.title)}</div>
        <span class="t-pill" id="x-phase">阅卷准备</span>
        <span class="t-pill" id="x-progress">1 / ${items.length}</span>
        <div class="spacer"></div>
        <span class="t-pill" id="x-sec" style="display:none"></span>
        <span class="tiny muted" id="x-hint"></span>
        <span class="timer" id="x-timer">${fmtTime(READ)}</span>
        <button class="btn btn-sm" id="x-fs" title="全屏">⛶</button>
        <button class="btn btn-danger btn-sm" id="x-submit">交卷</button>
      </div>
      <div class="exam-body">
        <div class="exam-main">
          <div class="playbar" id="x-playbar">
            <span class="dot"></span>
            <span class="pb-text" id="x-playtext">准备中…</span>
            <div class="wave" id="x-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <span class="ctrl" id="x-ctrl">录音尚未开始</span>
          </div>
          <div class="inst-box" id="x-inst" style="display:none"></div>
          <div class="q-group" id="x-questions"></div>
          <div class="exam-foot" id="x-foot"></div>
        </div>
        <aside class="sheet" id="x-sheet-wrap">
          <h4>答题卡 <span class="tiny muted" style="font-weight:500" id="x-sheet-hint"></span></h4>
          <div id="x-sheet"></div>
          <div class="sheet-foot">
            <div class="legend"><span><i style="background:#1d3f6b"></i>已作答</span><span><i style="background:rgba(255,255,255,.12)"></i>未作答</span></div>
            <div>已作答 <b id="x-done">0</b> / ${items.length}</div>
          </div>
        </aside>
      </div>
    </div>`;

  const els = {
    phase: $('#x-phase'), progress: $('#x-progress'), timer: $('#x-timer'), playbar: $('#x-playbar'),
    playtext: $('#x-playtext'), wave: $('#x-wave'), ctrl: $('#x-ctrl'), inst: $('#x-inst'),
    questions: $('#x-questions'), sheet: $('#x-sheet'), sheetWrap: $('#x-sheet-wrap'),
    sheetHint: $('#x-sheet-hint'), done: $('#x-done'), hint: $('#x-hint'), foot: $('#x-foot'), sec: $('#x-sec')
  };

  /* ---------------- 基础 ---------------- */

  function groupOf(mat) { return items.filter((it) => it.mat === mat); }
  function cur() { return items[E.idx] || items[0]; }

  function setPlay(html, playing) {
    els.playtext.innerHTML = html;
    els.playbar.classList.toggle('playing', !!playing);
  }

  function paintTimer() {
    const left = E.phase === 'listening' ? E.remain : E.left;
    els.timer.textContent = fmtTime(Math.max(0, left));
    els.timer.classList.toggle('low', left <= 60);
  }

  function optHTML(q, interactive) {
    const mine = E.answers[q.no];
    return Object.keys(q.options).filter((k) => q.options[k]).map((k) => `
      <button class="opt ${mine === k ? 'on' : ''}" data-q="${q.no}" data-k="${k}" ${interactive ? '' : 'disabled'}>
        <span class="k">${k}</span><span>${esc(q.options[k])}</span>
      </button>`).join('');
  }

  function cardHTML(it, interactive, focus) {
    const q = it.q;
    const mine = E.answers[q.no];
    return `<div class="q-card ${mine ? 'answered' : ''} ${focus ? 'focus' : ''}" data-no="${q.no}">
      <div class="q-head"><div class="q-no">${q.no}</div>
        <div class="tiny muted">${esc(it.sec.name)} · ${esc(it.mat.label || it.mat.id)}</div></div>
      <div class="q-text">${esc(q.text)}</div>
      <div class="q-opts">${optHTML(q, interactive)}</div>
    </div>`;
  }

  function bindOptions(scope) {
    $$('.opt', scope).forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); choose(Number(b.dataset.q), b.dataset.k); };
    });
    $$('.q-card', scope).forEach((c) => {
      c.onclick = () => {
        const no = Number(c.dataset.no);
        const i = items.findIndex((it) => it.no === no);
        if (i < 0) return;
        if (E.phase === 'listening' && items[i].mat !== cur().mat) return;
        E.idx = i; paintQuestions(); paintSheet();
      };
    });
  }

  /* ---------------- 渲染 ---------------- */

  function paintTop() {
    const phaseText = E.phase === 'reading' ? '阅卷准备'
      : E.phase === 'listening' ? '听音作答'
        : E.phase === 'review' ? '检查修改' : '已交卷';
    els.phase.textContent = phaseText;
    if (E.phase === 'listening') {
      const c = cur();
      els.sec.style.display = '';
      els.sec.textContent = c.sec.name + ' · 每段 ' + secPlays(c.sec) + ' 遍';
      els.progress.textContent = (E.idx + 1) + ' / ' + items.length;
      els.hint.textContent = '';
    } else {
      els.sec.style.display = 'none';
      els.progress.textContent = '已答 ' + Object.keys(E.answers).length + ' / ' + items.length;
      els.hint.textContent = E.phase === 'reading' ? '录音即将开始' : (E.phase === 'review' ? '可修改答案' : '');
    }
    paintTimer();
  }

  function paintQuestions() {
    if (E.phase === 'listening') {
      els.questions.classList.remove('scroll');
      const c = cur();
      const qs = groupOf(c.mat);
      els.questions.innerHTML = qs.map((it) => cardHTML(it, true, it.no === c.no)).join('');
      bindOptions(els.questions);
      const focus = $('.q-card.focus', els.questions);
      if (focus && focus.scrollIntoView) focus.scrollIntoView({ block: 'nearest' });
    } else {
      els.questions.classList.add('scroll');
      let html = '';
      sections.forEach((sec) => sec.materials.forEach((mat) => {
        const qs = groupOf(mat);
        html += `<div class="q-block">
          <div class="q-block-h">${esc(sec.name)} · ${esc(mat.label || mat.id)}　第 ${qs[0].no}${qs.length > 1 ? '–' + qs[qs.length - 1].no : ''} 题</div>
          ${qs.map((it) => cardHTML(it, E.phase === 'review', false)).join('')}
        </div>`;
      }));
      els.questions.innerHTML = html;
      if (E.phase === 'review') bindOptions(els.questions);
    }
  }

  function paintSheet() {
    let sheet = '';
    sections.forEach((s) => {
      const qnos = items.filter((it) => it.sec === s).map((it) => it.no);
      sheet += `<div class="sec-label">${esc(s.name)}（${qnos[0]}–${qnos[qnos.length - 1]} 题）</div>
        <div class="sheet-grid">${qnos.map((no) => {
          const done = !!E.answers[no];
          const isCur = E.phase === 'listening' && cur().no === no;
          return `<div class="sheet-cell ${done ? 'done' : ''} ${isCur ? 'cur' : ''}" data-no="${no}">${no}</div>`;
        }).join('')}</div>`;
    });
    els.sheet.innerHTML = sheet;
    els.sheetWrap.classList.toggle('locked', E.phase !== 'review');
    els.sheetHint.textContent = E.phase === 'review' ? '点击可跳转' : (E.phase === 'listening' ? '录音中不可跳转' : '');
    els.done.textContent = Object.keys(E.answers).length;
    $$('.sheet-cell', els.sheet).forEach((c) => {
      c.onclick = () => {
        const no = Number(c.dataset.no);
        const i = items.findIndex((it) => it.no === no);
        if (i < 0) return;
        if (E.phase === 'review') { E.idx = i; paintQuestions(); paintSheet(); }
        else if (E.phase === 'listening') {
          if (items[i].mat === cur().mat) { E.idx = i; paintQuestions(); paintSheet(); }
          else toast('录音播放中，不能跳到其他材料', 'warn');
        }
      };
    });
  }

  function paintFoot() {
    const left = items.length - items.filter((it) => E.answers[it.no]).length;
    let tip = '';
    if (E.phase === 'reading') tip = '<span>📖 阅卷阶段：可以浏览全部题目，录音开始后每段只显示本段题目</span>';
    else if (E.phase === 'listening') tip = `<span>🔔 提示音后开始播放 · 每段录音结束有 <b>${ANSWER}</b> 秒作答时间</span>`;
    else tip = '<span>✍️ 检查阶段：可以修改任意题目，倒计时结束自动收卷</span>';
    els.foot.innerHTML = `${tip}<div class="spacer"></div>
      <span>未作答 <b>${left}</b> 题</span>`;
  }

  function paint() {
    paintTop();
    paintQuestions();
    paintSheet();
    paintFoot();
  }

  function choose(no, k) {
    if (E.finished) return;
    if (E.phase === 'reading') { toast('阅卷阶段暂不能作答', 'warn'); return; }
    const it = items.find((x) => x.no === no);
    if (!it) return;
    E.answers[no] = k;
    paintQuestions();
    paintSheet();
    paintFoot();
    paintTop();
  }

  /* ---------------- 播放 ---------------- */

  function playFile(src, label) {
    return new Promise((resolve) => {
      const a = E.audio;
      if (E.abort || E.finished) return resolve(false);
      a.pause();
      a.src = src;
      a.currentTime = 0;
      a.volume = 1;
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        a.removeEventListener('ended', onEnd);
        a.removeEventListener('error', onErr);
        a.removeEventListener('timeupdate', onTime);
        resolve(ok);
      };
      const onEnd = () => finish(true);
      const onErr = () => finish(false);
      // 不显示进度：只靠波浪动画表示"正在播放"
      const onTime = () => { /* no-op */ };
      a.addEventListener('ended', onEnd);
      a.addEventListener('error', onErr);
      a.addEventListener('timeupdate', onTime);
      setPlay(label, true);
      a.play().catch(() => finish(false));
      setTimeout(() => finish(false), 240000);
    });
  }

  function wait(ms) {
    return new Promise((r) => {
      const t = setInterval(() => { if (E.abort || E.finished) { clearInterval(t); r(); } }, 120);
      setTimeout(() => { clearInterval(t); r(); }, ms);
    });
  }

  async function pauseWith(label, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (E.abort || E.finished) return;
      setPlay(`${label}　剩余 <b>${Math.ceil((end - Date.now()) / 1000)}</b> 秒`, false);
      await sleep(250);
    }
  }

  function instructionText(sec, mat) {
    const qs = groupOf(mat);
    const from = qs[0] ? qs[0].no : 1;
    const to = qs[qs.length - 1] ? qs[qs.length - 1].no : from;
    if (qs.length === 1) return `听下面一段对话，回答第 ${from} 小题。`;
    return `听下面一段对话或独白，回答第 ${from} 至第 ${to} 小题。`;
  }

  async function playMaterial(sec, mat) {
    const qs = groupOf(mat);
    E.matId = mat.id;
    E.playNo = 0;
    E.idx = items.findIndex((it) => it.no === (qs[0] ? qs[0].no : 1));
    paint();

    els.inst.style.display = 'block';
    els.inst.innerHTML = `<b>${esc(instructionText(sec, mat))}</b>`;

    // ① 中文指令音（提示音在正式录音前，每遍都响，见 ④）
    if (mat.promptAudio) {
      await playFile(mat.promptAudio, '播放中文指令…');
      await wait(300);
    } else {
      await wait(1200);
    }
    // ② 听前读题时间：每道题 5 秒（第一节 1 题 = 5 秒，第二节 2–4 题 = 10–20 秒）
    {
      const nums = qs[0].no === qs[qs.length - 1].no
        ? `第 ${qs[0].no} 题`
        : `第 ${qs[0].no}–${qs[qs.length - 1].no} 题`;
      await pauseWith(`请阅读${nums}的题干与选项`, 5000 * qs.length);
    }

    const src = audioSrc(set, mat);
    if (!src) {
      setPlay('<b>第 ' + (qs[0] ? qs[0].no : '') + ' 题材料：</b>缺少音频，跳过（约 8 秒）', false);
      els.ctrl.textContent = '缺少音频';
      await wait(8000);
      els.ctrl.textContent = '不可暂停 / 不可回听';
      return;
    }

    // ③ 播放：每一遍录音开始前都响一声提示音
    for (let p = 1; p <= secPlays(sec); p++) {
      if (E.abort || E.finished) return;
      E.playNo = p;
      if (App.settings.cueSound !== false) {
        setPlay(`🔔 提示音…（第 ${p} / ${secPlays(sec)} 遍）`, false);
        await Cue.play();
        await wait(260);
        if (E.abort || E.finished) return;
      }
      const label = `<b>${esc(mat.label || mat.id)}</b> · 正在播放第 <b>${p}</b> / ${secPlays(sec)} 遍`;
      const ok = await playFile(src, label);
      if (!ok) { setPlay('音频播放失败，已跳过', false); await wait(1200); break; }
      if (p < secPlays(sec)) await wait(2600);
    }
    // ④ 作答时间：每段录音结束共 5 秒（可在设置里改）
    setPlay('录音结束，请作答…', false);
    await pauseWith('作答时间', ANSWER * 1000);
  }

  /* ---------------- 阶段 ---------------- */

  let phaseResolve = null;
  function waitPhase() { return new Promise((r) => { phaseResolve = r; }); }
  function endPhase() { const r = phaseResolve; phaseResolve = null; if (r) r(); }

  async function phaseReading() {
    E.phase = 'reading';
    E.left = READ;
    els.inst.style.display = 'block';
    els.inst.innerHTML = `<div class="row" style="gap:12px;flex-wrap:wrap">
      <b>📖 阅卷准备</b><span class="cd">剩余 <b id="x-cd">${READ}</b> 秒</span>
      <span class="tiny">现在可以浏览全部 ${items.length} 道题（题干与选项），录音稍后开始。</span>
      <div class="spacer"></div>
      <button class="btn btn-sm btn-primary" id="x-skipread">立即开始听力</button></div>`;
    setPlay(`阅卷开始，${READ} 秒后播放录音…`, false);
    els.ctrl.textContent = '录音尚未开始';
    paint();
    const btn = $('#x-skipread');
    if (btn) btn.onclick = () => endPhase();
    if (READ > 0) await waitPhase();
    if (E.abort || E.finished) return;
    els.inst.innerHTML = '';
    els.ctrl.textContent = '不可暂停 / 不可回听';
  }

  async function phaseListening() {
    E.phase = 'listening';
    for (const sec of sections) {
      if (E.abort || E.finished) return;
      els.inst.style.display = 'block';
      els.inst.innerHTML = `<b>${esc(sec.name)}</b>　${esc(sec.desc)}`;
      setPlay(esc(sec.name) + ' 即将开始…', false);
      paint();
      await wait(2200);
      for (const mat of sec.materials) {
        if (E.abort || E.finished) return;
        await playMaterial(sec, mat);
      }
    }
    els.inst.innerHTML = '';
    setPlay('录音播放完毕…', false);
    await wait(800);
  }

  async function phaseReview() {
    E.phase = 'review';
    E.left = REVIEW;
    E.idx = 0;
    els.inst.style.display = 'block';
    els.inst.innerHTML = `<div class="row" style="gap:12px;flex-wrap:wrap">
      <b>✍️ 检查修改</b><span class="cd">剩余 <b id="x-cd">${REVIEW}</b> 秒</span>
      <span class="tiny">录音已结束，可以查看并修改全部答案，倒计时结束自动收卷。</span>
      <div class="spacer"></div>
      <button class="btn btn-sm btn-primary" id="x-submitnow">交卷</button></div>`;
    setPlay('听力结束，进入检查阶段…', false);
    els.ctrl.textContent = '可修改答案';
    paint();
    const b = $('#x-submitnow');
    if (b) b.onclick = () => submit(false);
    if (REVIEW > 0) await waitPhase();
  }

  function startTicker() {
    E.tick = setInterval(() => {
      if (E.finished) return;
      if (E.phase === 'reading') {
        E.left = Math.max(0, E.left - 1);
        if (E.left === 0) endPhase();
      } else if (E.phase === 'listening') {
        E.remain = Math.max(0, E.remain - 1);
        if (E.remain === 0) submit(true);
      } else if (E.phase === 'review') {
        E.left = Math.max(0, E.left - 1);
        if (E.left === 0) endPhase();
      }
      paintTimer();
      // 阅卷 / 检查阶段的醒目倒计时
      const cd = $('#x-cd');
      if (cd) {
        cd.textContent = E.left;
        const box = cd.closest('.cd');
        if (box) box.classList.toggle('low', E.left <= 10);
      }
    }, 1000);
  }

  /* ---------------- 交卷 ---------------- */

  async function submit(auto) {
    if (E.finished) return;
    const unanswered = items.filter((it) => !E.answers[it.no]).length;
    if (!auto) {
      const ok = await new Promise((resolve) => {
        modal({
          title: '确认交卷？',
          body: `<p class="muted">已作答 <b>${items.length - unanswered}</b> 题${unanswered ? `，还有 <b style="color:#e03131">${unanswered}</b> 题未作答` : ''}。<br>交卷后将无法继续作答，但可以查看原文精析。</p>`,
          actions: [
            { label: '继续作答', onClick: () => resolve(false) },
            { label: '确认交卷', cls: 'btn-primary', onClick: () => resolve(true) }
          ]
        });
        const mask = $('#modal-root').lastElementChild;
        const obs = new MutationObserver(() => { if (!mask.parentNode) { obs.disconnect(); resolve(false); } });
        obs.observe($('#modal-root'), { childList: true });
      });
      if (!ok) return;
    }

    E.finished = true;
    E.abort = true;
    E.phase = 'submitted';
    E.audio.pause();
    clearInterval(E.tick);
    endPhase();
    document.body.classList.remove('exam-running');

    const res = scoreOf(set, E.answers);
    const duration = Math.round((Date.now() - E.startedAt) / 1000);
    const record = {
      id: uid('r'),
      setId: set.id,
      setName: set.title,
      mode,
      at: Date.now(),
      duration,
      score: mode === 'full' ? res.score : +(res.right * (set.scorePerQuestion || 1.5)).toFixed(1),
      full: mode === 'full' ? 30 : +(items.length * (set.scorePerQuestion || 1.5)).toFixed(1),
      right: res.right,
      total: mode === 'full' ? 20 : items.length,
      answers: E.answers,
      detail: res.detail.filter((d) => items.some((it) => it.no === d.no)),
      blurred: E.blurred,
      auto: !!auto,
      name: localStorage.getItem('gk.name') || ''
    };
    WrongBook.add(set, record.detail);
    window.__lastRecord = record;
    App.records.unshift(record);
    try { await api.post('/api/records', record); } catch (e) { console.warn('记录保存失败', e); }

    document.body.classList.remove('exam-mode');
    const mask = document.createElement('div');
    mask.className = 'countdown';
    mask.innerHTML = `<div><div style="font-size:52px">✅</div>
      <div style="font-size:22px;font-weight:800;margin-top:14px">${auto ? '考试结束，已自动收卷' : '已交卷'}</div>
      <div class="muted" style="color:#8fb2e8;margin-top:10px">得分 ${record.score} / ${record.full}　正在生成成绩报告…</div></div>`;
    document.body.appendChild(mask);
    setTimeout(() => { mask.remove(); go(`#/report?id=${record.id}`); }, 1400);
  }

  /* ---------------- 事件 ---------------- */

  $('#x-submit').onclick = () => submit(false);
  $('#x-fs').onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => toast('浏览器不支持全屏', 'warn'));
    else document.exitFullscreen().catch(() => {});
  };

  document.addEventListener('visibilitychange', () => { if (document.hidden && !E.finished) E.blurred += 1; });

  const keyHandler = (e) => {
    if (E.finished) return;
    const k = e.key.toUpperCase();
    const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
    if (['A', 'B', 'C', 'D'].includes(k) || map[k]) {
      const it = items[E.idx];
      if (!it) return;
      const letter = map[k] || k;
      if (it.q.options[letter]) { choose(it.no, letter); e.preventDefault(); }
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (E.phase === 'listening' && items[E.idx + 1] && items[E.idx + 1].mat !== cur().mat) return;
      if (E.idx < items.length - 1) { E.idx += 1; paintQuestions(); paintSheet(); e.preventDefault(); }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (E.phase === 'listening') return;
      if (E.idx > 0) { E.idx -= 1; paintQuestions(); paintSheet(); e.preventDefault(); }
    }
  };
  window.addEventListener('keydown', keyHandler);

  setCleanup(() => {
    E.abort = true;
    E.finished = true;
    clearInterval(E.tick);
    E.audio.pause();
    E.audio.src = '';
    window.removeEventListener('keydown', keyHandler);
    document.body.classList.remove('exam-mode', 'exam-running');
  });

  if (localStorage.getItem('gk.fullscreen') === '1') document.documentElement.requestFullscreen().catch(() => {});

  startTicker();
  (async () => {
    await phaseReading();
    if (E.abort || E.finished) return;
    await phaseListening();
    if (E.abort || E.finished) return;
    await phaseReview();
    if (E.abort || E.finished) return;
    submit(true);
  })();
};
