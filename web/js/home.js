/* 首页 */
'use strict';

function setCardHTML(s) {
  const total = s.audioTotal || 0;
  const have = s.audioHave || 0;
  const isMock = String(s.id).indexOf('mock') === 0 || /模拟|仿真/.test(s.exam || '');
  const audioBadge = total === 0
    ? badgen('无音频', 'warn')
    : (have >= total ? badgen(`音频 ${have}/${total}`, 'ok') : badgen(`音频 ${have}/${total}`, 'warn'));
  const ready = total > 0 && have >= total;
  return `
  <div class="set-card" data-id="${esc(s.id)}">
    <div class="row" style="gap:6px">
      ${badgen(isMock ? '模拟' : '真题', isMock ? 'warn' : 'ok')}
      ${s.year ? badgen(s.year + ' 年', 'blue') : ''}
      ${s.exam && !(isMock && s.exam === '模拟卷') ? badgen(s.exam, '') : ''}
      ${badgen((s.total || 0) + ' 题', '')}
      ${audioBadge}
    </div>
    <h4>${esc(s.title || s.id)}</h4>
    <div class="tiny muted">共 ${(s.sections || []).length} 节 · ${(s.sections || []).reduce((a, x) => a + x.materials.length, 0)} 段材料 · 满分 ${(((s.total || 0) * (s.scorePerQuestion || 1.5))).toFixed(0)} 分</div>
    <div class="ops">
      <button class="btn btn-primary btn-sm" data-act="exam" ${ready ? '' : 'title="音频不完整，仍可进入（将跳过无声材料）"'}>全真模考</button>
      <button class="btn btn-sm" data-act="practice">精听</button>
      <button class="btn btn-sm" data-act="audio">音频</button>
      <button class="btn btn-sm btn-ghost" data-act="info">详情</button>
    </div>
  </div>`;
}

function examSetupModal(s) {
  const opts = s.sections.map((sec, i) => {
    const n = sec.materials.reduce((a, m) => a + m.questions.length, 0);
    return `<option value="sec${i}">${esc(sec.name)}（${n} 题，约 ${Math.max(3, Math.round(n * 1.1))} 分钟）</option>`;
  }).join('');
  modal({
    title: '开始全真模考',
    body: `
      <p class="muted tiny" style="margin-bottom:14px">${esc(s.title)}</p>
      <label class="field"><span>考试范围</span>
        <select id="m-mode">
          <option value="full">完整试卷（${s.total} 题 · 30 分 · 约 20 分钟）</option>
          ${opts}
        </select>
      </label>
      <label class="field"><span>姓名（可选，用于成绩单）</span>
        <input type="text" id="m-name" placeholder="例：张同学" value="${esc(localStorage.getItem('gk.name') || '')}">
      </label>
      <div class="row tiny muted" style="gap:14px">
        <label><input type="checkbox" id="m-fullscreen" checked> 全屏作答</label>
        <label><input type="checkbox" id="m-hideans" ${App.settings.hideAnswerWhileExam ? 'checked' : ''}> 考试中不显示对错</label>
      </div>`,
    actions: [
      { label: '取消' },
      {
        label: '进入考场',
        cls: 'btn-primary',
        onClick: (m) => {
          const mode = $('#m-mode', m.el).value;
          const name = $('#m-name', m.el).value.trim();
          localStorage.setItem('gk.name', name);
          App.settings.hideAnswerWhileExam = $('#m-hideans', m.el).checked;
          saveSettings();
          const fs = $('#m-fullscreen', m.el).checked;
          localStorage.setItem('gk.fullscreen', fs ? '1' : '0');
          go(`#/pre?set=${encodeURIComponent(s.id)}&mode=${mode}`);
        }
      }
    ]
  });
}

function setInfoModal(s) {
  const mats = [];
  s.sections.forEach((sec) => sec.materials.forEach((m) => {
    mats.push(`<div class="parse-mat"><div class="pt">${esc(sec.name)} · ${esc(m.id)} ${m.hasAudio ? badgen('有音频', 'ok') : badgen('缺音频', 'warn')}</div>
      <div class="pq">${m.questions.map((q) => '第' + q.no + '题 ' + esc(q.text.slice(0, 40))).join('　')}</div></div>`);
  }));
  modal({
    title: s.title,
    wide: true,
    body: `<div class="row tiny muted" style="margin-bottom:12px">
        ${s.year ? badgen(s.year + ' 年', 'blue') : ''} ${s.exam ? badgen(s.exam) : ''} ${badgen((s.total || 0) + ' 题')}
        ${s.source ? `<span>来源：${esc(s.source)}</span>` : ''}
      </div>
      <div class="parse-tree">${mats.join('')}</div>`,
    actions: [{ label: '关闭' }]
  });
}

function rulesCard() {
  return `
  <div class="card card-pad" style="margin-top:22px">
    <div class="card-h"><h3>📌 2026 安徽高考外语听力（机考）要点</h3><div class="spacer"></div>
      <button class="btn btn-sm" id="btn-help">操作说明</button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px" id="rules-grid">
      <ul class="notice-list">
        <li><b>题量与分值：</b>共 20 小题，每小题 1.5 分，满分 30 分，考试用时约 20 分钟。</li>
        <li><b>第一节：</b>5 段短对话，每段 1 题；<b>每段录音播放两遍</b>（2026 年改革点，原为一遍）。</li>
        <li><b>第二节：</b>5 段长对话或独白，共 15 题，每段录音播放两遍。</li>
        <li><b>形式：</b>计算机化考试，戴耳机听音，屏幕点选作答，不能暂停、不能回听。</li>
      </ul>
      <ul class="notice-list">
        <li><b>节奏：</b>原"9 磅 15 便士"试音例题取消，开考后直接进入正题，需提前熟悉界面。</li>
        <li><b>语速：</b>2026 年起录音语速提升到约 143 词/分，信息更浓缩，干扰项更多。</li>
        <li><b>策略：</b>指令与停顿时间预读选项；第一遍抓主旨关键词，第二遍验证细节（数字、否定、转折）。</li>
        <li><b>提示：</b>安徽 2026 年 3 月首考仍为纸笔，2026 年 5 月起组织机考试点，2027 年起全面机考；本系统按机考流程训练。</li>
      </ul>
    </div>
  </div>`;
}

function helpModal() {
  modal({
    title: '使用说明',
    wide: true,
    body: `
      <h4 style="margin-bottom:8px">一、三种练习方式</h4>
      <ul class="notice-list">
        <li><b>全真模考：</b>按真实机考流程：输入姓名 → 设备试音 → 阅读须知 → 倒计时开考 → 自动连播（第一节两遍、第二节两遍）→ 自动收卷 → 成绩报告。考试中<b>不能暂停、不能回听</b>。</li>
        <li><b>精听练习：</b>按材料逐段播放，可倍速、可循环、可看原文与答案，用来查漏补缺。</li>
        <li><b>题库管理：</b>导入自己的材料（粘贴文本 / .txt / .docx），或上传音频、一键 AI 配音。</li>
      </ul>
      <h4 style="margin:16px 0 8px">二、没有音频怎么办</h4>
      <ul class="notice-list">
        <li>在「题库管理 → 音频工作台」里，点<b>一键生成</b>：用 edge-tts 神经语音把听力原文自动合成男女声对话（需联网，首次约 5–15 秒/段）。</li>
        <li>也可以用 Windows 本地语音（SAPI，离线）合成；质量略逊但可应急。</li>
        <li>若手里有听力书的 MP3，可直接<b>上传</b>到对应材料，效果最好。</li>
      </ul>
      <h4 style="margin:16px 0 8px">三、键盘快捷键（模考中）</h4>
      <ul class="notice-list">
        <li><b>A / B / C / D</b> 或 <b>1 / 2 / 3 / 4</b>：选择当前题答案</li>
        <li><b>← / →</b>：切换当前小题；<b>空格</b>：交卷确认（需再点一次）</li>
      </ul>
      <h4 style="margin:16px 0 8px">四、数据存放</h4>
      <p class="tiny muted">题库在 <span class="mono">gk-listening/data/sets/</span>，音频在 <span class="mono">data/audio/</span>，成绩记录在 <span class="mono">data/records.json</span>。整个文件夹可拷到任意电脑使用（需装 Node.js）。</p>`,
    actions: [{ label: '知道了', cls: 'btn-primary' }]
  });
}

Views.home = async function (params, app) {
  await loadRecords();
  const sets = App.sets;
  const records = App.records.filter((r) => r.mode === 'full' || !r.mode);
  const avg = records.length ? (records.reduce((a, r) => a + (r.score || 0), 0) / records.length) : 0;
  const best = records.length ? Math.max.apply(null, records.map((r) => r.score || 0)) : 0;
  const wrong = WrongBook.list();

  const stats = `
    <div class="stat-grid">
      <div class="stat"><b>${sets.length}</b><span>题库试卷</span></div>
      <div class="stat"><b>${records.length}</b><span>完整模考次数</span></div>
      <div class="stat"><b>${avg ? avg.toFixed(1) : '—'}</b><span>模考平均分 / 30</span></div>
      <div class="stat"><b>${wrong.length}</b><span>待攻克错题</span></div>
    </div>`;

  const cards = sets.length
    ? sets.map(setCardHTML).join('')
    : `<div class="card card-pad empty" style="grid-column:1/-1">
         <div class="big">🎧</div>
         <h3>题库还是空的</h3>
         <p class="muted" style="margin:8px 0 16px">可以把听力书的文本粘贴进来，或导入 .txt / .docx，系统会自动切分题目、选项、答案和原文。</p>
         <a class="btn btn-primary" href="#/bank?tab=import">导入第一套听力材料</a>
       </div>`;

  app.innerHTML = shell(`
    <div class="hero">
      <h1>高考英语听力 · 上机仿真练习系统</h1>
      <p class="sub">还原计算机化考试的流程、节奏与压迫感：试音 → 倒计时 → 自动连播 → 自动收卷 → 原文精析</p>
      <div class="facts">
        <div class="fact"><b>20</b> 小题</div>
        <div class="fact"><b>30</b> 分</div>
        <div class="fact"><b>20</b> 分钟</div>
        <div class="fact">第一节 <b>2</b> 遍</div>
        <div class="fact">第二节 <b>2</b> 遍</div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-lg" id="hero-exam">开始全真模考</button>
        <a class="btn btn-ghost btn-lg" href="#/practice">精听练习</a>
        <a class="btn btn-ghost btn-lg" href="#/bank?tab=import">导入听力材料</a>
      </div>
    </div>
    ${stats}
    <div class="section-title"><h2>题库</h2><span id="set-count">${sets.length} 套 · 点击卡片开始</span>
      <div class="spacer"></div>
      <div class="row" id="set-filter" style="gap:6px;margin-right:10px">
        <button class="btn btn-sm" data-filter="all">全部</button>
        <button class="btn btn-sm" data-filter="real">真题</button>
        <button class="btn btn-sm" data-filter="mock">模拟题</button>
      </div>
      <a class="btn btn-sm" href="#/bank">管理题库</a></div>
    <div class="set-grid" id="set-grid">${cards}</div>
    ${rulesCard()}
  `, 'home');

  const isMock = (s) => String(s.id).indexOf('mock') === 0 || /模拟|仿真/.test(s.exam || '');
  const reals = sets.filter((s) => !isMock(s)).length;
  const mocks = sets.length - reals;
  let filter = 'all';

  function bindCards() {
    $$('#set-grid .set-card').forEach((card) => {
      const s = getSet(card.dataset.id);
      card.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        const a = act.dataset.act;
        if (a === 'exam') examSetupModal(s);
        else if (a === 'practice') go('#/practice?set=' + encodeURIComponent(s.id));
        else if (a === 'audio') go('#/bank?tab=audio&set=' + encodeURIComponent(s.id));
        else if (a === 'info') setInfoModal(s);
      });
    });
  }

  function paintGrid() {
    const list = sets.filter((s) => filter === 'all' || (filter === 'mock' ? isMock(s) : !isMock(s)));
    $('#set-grid').innerHTML = list.length
      ? list.map(setCardHTML).join('')
      : `<div class="card card-pad empty" style="grid-column:1/-1"><p>这个分类下还没有试卷</p></div>`;
    $('#set-count').textContent = `${list.length} 套 · 真题 ${reals} / 模拟 ${mocks}`;
    $$('#set-filter button').forEach((b) => b.classList.toggle('btn-primary', b.dataset.filter === filter));
    bindCards();
  }
  $$('#set-filter button').forEach((b) => {
    b.onclick = () => { filter = b.dataset.filter; paintGrid(); };
  });
  paintGrid();

  $('#hero-exam').onclick = () => {
    if (!sets.length) { location.hash = '#/bank?tab=import'; return; }
    if (sets.length === 1) { examSetupModal(sets[0]); return; }
    pickSetModal();
  };
  $('#btn-help').onclick = helpModal;
};

function pickSetModal() {
  modal({
    title: '选择试卷',
    wide: true,
    body: `<div class="set-grid" style="margin:0;grid-template-columns:1fr">
      ${App.sets.map((s) => `<button class="set-card" style="text-align:left;cursor:pointer;font-family:inherit" data-pick="${esc(s.id)}">
        <h4>${esc(s.title)}</h4>
        <div class="tiny muted">${s.total} 题 · 音频 ${s.audioHave || 0}/${s.audioTotal || 0}</div>
      </button>`).join('')}
    </div>`,
    actions: [{ label: '取消' }]
  });
  $$('[data-pick]').forEach((b) => {
    b.onclick = () => {
      $('.modal-mask').remove();
      examSetupModal(getSet(b.dataset.pick));
    };
  });
}
