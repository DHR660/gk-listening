/* 题库管理：列表 / 文本导入 / 音频工作台 / 设置 */
'use strict';

const VOICES = {
  male: [
    ['en-US-GuyNeural', '美音 · Guy（男，推荐）'],
    ['en-US-BrianNeural', '美音 · Brian（男，较成熟）'],
    ['en-GB-RyanNeural', '英音 · Ryan（男）'],
    ['en-AU-WilliamNeural', '澳音 · William（男）']
  ],
  female: [
    ['en-US-JennyNeural', '美音 · Jenny（女，推荐）'],
    ['en-US-AriaNeural', '美音 · Aria（女，清晰）'],
    ['en-GB-SoniaNeural', '英音 · Sonia（女）'],
    ['en-AU-NatashaNeural', '澳音 · Natasha（女）']
  ],
  narrator: [
    ['zh-CN-XiaoxiaoNeural', '中文 · 晓晓（女）'],
    ['zh-CN-YunxiNeural', '中文 · 云希（男）'],
    ['zh-CN-YunyangNeural', '中文 · 云扬（男，播音腔）']
  ]
};

function promptTextOf(sec, m) {
  const qs = m.questions || [];
  if (!qs.length) return '听下面一段材料。';
  const from = qs[0].no;
  const to = qs[qs.length - 1].no;
  if (from === to) return `听下面一段对话，回答第${from}小题。`;
  if (/第一节/.test(sec.name)) return `听下面一段对话，回答第${from}小题。`;
  return `听下面一段对话或独白，回答第${from}至第${to}小题。`;
}

Views.bank = async function (params, app) {
  await loadSets();
  const S = {
    tab: params.tab || 'list',
    setId: params.set || (App.sets[0] && App.sets[0].id) || '',
    importText: '',
    fileName: '',
    parsed: null,
    running: false,
    q: ''
  };

  function renderShell() {
    app.innerHTML = shell(`
      <div class="row" style="margin-bottom:6px">
        <div>
          <h2 style="font-size:22px">题库管理</h2>
          <p class="tiny muted">导入听力材料、生成配音、维护试卷</p>
        </div>
        <div class="spacer"></div>
        <a class="btn btn-sm" href="#/home">← 首页</a>
      </div>
      <div class="tabs" id="bank-tabs">
        <button data-tab="list">题库列表</button>
        <button data-tab="import">文本导入</button>
        <button data-tab="audio">音频工作台</button>
        <button data-tab="settings">设置</button>
      </div>
      <div id="bank-body"></div>`, 'bank');
    $$('#bank-tabs button').forEach((b) => {
      b.onclick = () => { S.tab = b.dataset.tab; paint(); };
    });
    paint();
  }

  function paint() {
    $$('#bank-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    const body = $('#bank-body');
    if (S.tab === 'list') paintList(body);
    else if (S.tab === 'import') paintImport(body);
    else if (S.tab === 'audio') paintAudio(body);
    else paintSettings(body);
  }

  /* ---------------------------------------------------------- 列表 */

  function paintList(body) {
    const q = (S.q || '').trim().toLowerCase();
    const list = App.sets.filter((s) => !q || (s.title + ' ' + s.id + ' ' + (s.exam || '') + ' ' + (s.year || '')).toLowerCase().includes(q));
    const rows = list.map((s) => `
      <tr>
        <td><b>${esc(s.title)}</b>
          <div class="tiny muted">${esc(s.id)}${s.source ? ' · ' + esc(s.source.slice(0, 40)) : ''}</div></td>
        <td>${s.year || '—'}</td>
        <td class="num">${s.total || 0}</td>
        <td>${(s.audioHave || 0) >= (s.audioTotal || 0) && s.audioTotal
          ? badgen('完整 ' + s.audioHave + '/' + s.audioTotal, 'ok')
          : badgen((s.audioHave || 0) + '/' + (s.audioTotal || 0), 'warn')}</td>
        <td>
          <div class="row" style="gap:6px">
            <a class="btn btn-sm" href="#/pre?set=${encodeURIComponent(s.id)}&mode=full">模考</a>
            <a class="btn btn-sm" href="#/practice?set=${encodeURIComponent(s.id)}">精听</a>
            <a class="btn btn-sm" href="#/bank?tab=audio&set=${encodeURIComponent(s.id)}">音频</a>
            <button class="btn btn-sm" data-edit="${esc(s.id)}">重命名</button>
            <button class="btn btn-sm" data-export="${esc(s.id)}">导出</button>
            <button class="btn btn-sm btn-danger" data-del="${esc(s.id)}">删除</button>
          </div>
        </td>
      </tr>`).join('');
    const realCount = App.sets.filter((s) => !(String(s.id).indexOf('mock') === 0 || /模拟|仿真/.test(s.exam || ''))).length;
    const mockCount = App.sets.length - realCount;

    body.innerHTML = `
      <div class="card card-pad">
        <div class="card-h"><h3>共 ${App.sets.length} 套（真题 ${realCount} / 模拟 ${mockCount}）</h3><div class="spacer"></div>
          <input type="text" id="bank-q" placeholder="搜索标题 / 年份 / id" value="${esc(S.q || '')}" style="width:220px">
          <button class="btn btn-sm" id="btn-import-json">导入 JSON</button>
          <button class="btn btn-sm" id="btn-export-all">导出全部</button>
          <button class="btn btn-primary btn-sm" id="btn-new">+ 导入新材料</button>
        </div>
        ${list.length ? `<table class="tbl"><thead><tr><th>试卷</th><th>年份</th><th>题数</th><th>音频</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty"><div class="big">📚</div><p>${App.sets.length ? '没有匹配的试卷' : '还没有试卷，去「文本导入」粘贴听力材料吧'}</p></div>`}
      </div>`;

    $('#bank-q').oninput = (e) => {
      S.q = e.target.value;
      paintList(body);
      const inp = $('#bank-q');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    };

    $('#btn-new').onclick = () => { S.tab = 'import'; paint(); };
    $('#btn-export-all').onclick = () => download('听力题库备份_' + Date.now() + '.json', JSON.stringify({ app: 'gk-listening', sets: App.sets }, null, 2));
    $('#btn-import-json').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        try {
          const txt = await f.text();
          const data = JSON.parse(txt);
          const list = Array.isArray(data) ? data : (data.sets || [data]);
          let n = 0;
          for (const s of list) {
            await api.post('/api/sets', s);
            n += 1;
          }
          await loadSets();
          toast(`已导入 ${n} 套试卷`, 'ok');
          paint();
        } catch (e) { toast('导入失败：' + e.message, 'bad'); }
      };
      inp.click();
    };
    $$('[data-edit]').forEach((b) => {
      b.onclick = () => {
        const s = getSet(b.dataset.edit);
        modal({
          title: '修改试卷信息',
          body: `
            <label class="field"><span>标题</span><input type="text" id="e-title" value="${esc(s.title)}"></label>
            <div class="row"><label class="field" style="flex:1"><span>年份</span><input type="text" id="e-year" value="${esc(s.year || '')}"></label>
            <label class="field" style="flex:1"><span>试卷名（来源）</span><input type="text" id="e-exam" value="${esc(s.exam || '')}"></label></div>`,
          actions: [
            { label: '取消' },
            {
              label: '保存', cls: 'btn-primary', onClick: async (m) => {
                s.title = $('#e-title', m.el).value.trim() || s.title;
                s.year = Number($('#e-year', m.el).value) || '';
                s.exam = $('#e-exam', m.el).value.trim();
                await api.put('/api/sets/' + s.id, s);
                await loadSets();
                toast('已保存', 'ok');
                paint();
              }
            }
          ]
        });
      };
    });
    $$('[data-export]').forEach((b) => {
      b.onclick = async () => {
        const s = getSet(b.dataset.export);
        download(s.id + '.json', JSON.stringify(s, null, 2));
      };
    });
    $$('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const s = getSet(b.dataset.del);
        const ok = await confirmDialog('删除试卷', `确定删除《${esc(s.title)}》吗？该试卷的音频文件也会一起删除，且无法恢复。`, { danger: true, okText: '删除' });
        if (!ok) return;
        await api.del('/api/sets/' + s.id);
        await loadSets();
        toast('已删除', 'ok');
        paint();
      };
    });
  }

  /* ---------------------------------------------------------- 导入 */

  function paintImport(body) {
    body.innerHTML = `
      <div class="card card-pad">
        <div class="card-h"><h3>粘贴 / 导入听力材料文本</h3><div class="spacer"></div>
          <button class="btn btn-sm" id="imp-tpl">插入模板</button>
          <button class="btn btn-sm" id="imp-file-btn">选择 .txt / .docx 文件</button>
          <input type="file" id="imp-file" accept=".txt,.md,.docx" hidden>
        </div>
        <div class="row" style="margin-bottom:12px">
          <label class="field" style="flex:2;margin:0"><span>试卷标题（留空则自动识别）</span>
            <input type="text" id="imp-title" placeholder="例：2024年高考英语听力（新课标Ⅰ卷）" value="${esc(S.title || '')}"></label>
          <label class="field" style="flex:1;margin:0"><span>年份</span>
            <input type="text" id="imp-year" placeholder="2024" value="${esc(S.year || '')}"></label>
          <label class="field" style="flex:1;margin:0"><span>ID（可留空）</span>
            <input type="text" id="imp-id" placeholder="gk2024-xkb1" value="${esc(S.id || '')}"></label>
        </div>
        <textarea id="imp-text" rows="13" placeholder="把听力书的文本粘贴到这里……" style="font-size:14px;line-height:1.7">${esc(S.importText)}</textarea>
        <div class="row" style="margin-top:12px">
          <button class="btn btn-primary" id="imp-parse">智能解析</button>
          <button class="btn" id="imp-clear">清空</button>
          <div class="spacer"></div>
          <span class="tiny muted" id="imp-file-name">${esc(S.fileName || '')}</span>
        </div>
      </div>
      <div id="imp-prev" style="margin-top:16px"></div>
      <details class="fold" style="margin-top:16px">
        <summary>支持的文本格式说明</summary>
        <div class="tiny muted" style="line-height:1.9">
          <p><b>格式一（讲义式，最稳妥）：</b>用 <span class="mono">Text 1 / 材料1 / 第1段</span> 分出每段材料，紧跟原文；题目用 <span class="mono">1. 题干</span> + <span class="mono">A. / B. / C.</span> + <span class="mono">答案: B</span>。</p>
          <p><b>格式二（试卷式）：</b>前半部分是 1–20 题（题干 + 选项 + 答案），末尾写「听力原文」，下面依次 <span class="mono">Text 1 … Text 10</span>。系统会自动把 20 题按 5 段短对话 + 5 段长对话/独白分组。</p>
          <p><b>选项：</b>支持一行一个（A. …）或一行并列（A. … B. … C. …）。</p>
          <p><b>答案：</b>支持 <span class="mono">1-5 BCACA</span>、<span class="mono">1.B 2.C</span>、<span class="mono">答案：B</span> 三种写法。</p>
          <p>解析后可以在预览里微调 JSON，或直接保存后到「音频工作台」补音频。</p>
        </div>
        <pre>${esc(Parser.TEMPLATE)}</pre>
      </details>`;

    const ta = $('#imp-text');
    ta.oninput = () => { S.importText = ta.value; };
    $('#imp-title').oninput = (e) => { S.title = e.target.value; };
    $('#imp-year').oninput = (e) => { S.year = e.target.value; };
    $('#imp-id').oninput = (e) => { S.id = e.target.value; };
    $('#imp-tpl').onclick = () => { ta.value = Parser.TEMPLATE; S.importText = ta.value; ta.focus(); };
    $('#imp-clear').onclick = () => { ta.value = ''; S.importText = ''; $('#imp-prev').innerHTML = ''; S.parsed = null; };
    $('#imp-file-btn').onclick = () => $('#imp-file').click();
    $('#imp-file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const buf = await f.arrayBuffer();
        const res = await fetch('/api/extract?name=' + encodeURIComponent(f.name), { method: 'POST', body: buf });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || '解析失败');
        ta.value = data.text;
        S.importText = data.text;
        S.fileName = f.name + '（' + data.text.length + ' 字）';
        $('#imp-file-name').textContent = S.fileName;
        toast('文件已导入，点"智能解析"继续', 'ok');
      } catch (err) {
        toast('读取失败：' + err.message, 'bad');
      }
    };
    $('#imp-parse').onclick = () => {
      const text = ta.value.trim();
      if (!text) { toast('请先粘贴或导入文本', 'warn'); return; }
      S.importText = text;
      const r = Parser.parse(text, { title: S.title, year: S.year, id: S.id });
      S.parsed = r;
      renderPreview();
    };

    if (S.parsed) renderPreview();

    function renderPreview() {
      const r = S.parsed;
      const box = $('#imp-prev');
      if (!r || !r.ok) {
        box.innerHTML = `<div class="card card-pad"><div class="card-h"><h3>解析失败</h3></div>
          <ul class="notice-list">${(r ? r.warnings : ['未知错误']).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`;
        return;
      }
      const set = r.set;
      const tree = set.sections.map((sec) => `
        <div><div class="pt" style="font-weight:800;margin:10px 0 6px">${esc(sec.name)} · 每段 ${sec.plays} 遍 · ${sec.materials.length} 段</div>
        ${sec.materials.map((m) => `
          <div class="parse-mat">
            <div class="pt">${esc(m.label)}　<span class="tiny muted">${m.questions.length} 题</span>
              ${m.transcript ? badgen('有原文 ' + m.transcript.length + ' 字', 'ok') : badgen('缺原文', 'warn')}</div>
            <div class="pq">${m.questions.map((q) => `第${q.no}题 <em>${esc(q.answer || '?')}</em>`).join('　')}</div>
            ${m.transcript ? `<div class="script-preview" style="max-height:60px">${esc(m.transcript.slice(0, 160))}…</div>` : ''}
          </div>`).join('')}
        </div>`).join('');

      box.innerHTML = `
        <div class="card card-pad">
          <div class="card-h"><h3>解析结果</h3>
            ${badgen(r.stats.questions + ' 题', 'blue')}
            ${badgen(r.stats.materials + ' 段材料', '')}
            ${badgen('答案 ' + r.stats.answers + ' 个', r.stats.answers >= r.stats.questions ? 'ok' : 'warn')}
            <div class="spacer"></div>
            <button class="btn btn-primary" id="imp-save">保存到题库</button>
          </div>
          ${r.warnings.length ? `<div class="inst-box" style="margin-bottom:12px;color:#8a5300;background:#fff8e8;border-color:#f5d9a8">
            ${r.warnings.map((w) => '⚠️ ' + esc(w)).join('<br>')}</div>` : ''}
          <div class="row tiny muted" style="margin-bottom:10px">
            识别标题：<b>${esc(set.title)}</b>　年份：${set.year || '—'}　ID：<span class="mono">${esc(set.id)}</span>
          </div>
          <div class="parse-tree">${tree}</div>
          <details class="fold" style="margin-top:14px">
            <summary>手动微调（JSON）</summary>
            <p class="tiny muted" style="margin:8px 0">可以直接改题干、答案、原文；改完点下方"应用修改"。格式错误会提示。</p>
            <textarea id="imp-json" rows="16" class="mono" style="font-size:12.5px;line-height:1.6">${esc(JSON.stringify(set, null, 2))}</textarea>
            <div class="row" style="margin-top:8px"><button class="btn btn-sm" id="imp-apply">应用修改</button></div>
          </details>
        </div>`;

      $('#imp-apply').onclick = () => {
        try {
          const obj = JSON.parse($('#imp-json').value);
          S.parsed = { ok: true, set: obj, warnings: [], stats: r.stats };
          renderPreview();
          toast('已应用修改', 'ok');
        } catch (e) { toast('JSON 格式错误：' + e.message, 'bad'); }
      };
      $('#imp-save').onclick = async () => {
        try {
          const obj = JSON.parse($('#imp-json').value || JSON.stringify(set));
          const res = await api.post('/api/sets', obj);
          await loadSets();
          toast('已保存：' + obj.title, 'ok');
          S.setId = res.id;
          S.tab = 'audio';
          paint();
        } catch (e) { toast('保存失败：' + e.message, 'bad'); }
      };
    }
  }

  /* ---------------------------------------------------------- 音频工作台 */

  function paintAudio(body) {
    if (!App.sets.length) {
      body.innerHTML = `<div class="card card-pad empty"><div class="big">🎙️</div><p>还没有试卷，先导入材料</p>
        <a class="btn btn-primary" style="margin-top:14px" href="#/bank?tab=import">去导入</a></div>`;
      return;
    }
    const st = App.settings;
    const set = getSet(S.setId) || App.sets[0];
    S.setId = set.id;
    const mats = [];
    set.sections.forEach((sec) => sec.materials.forEach((m) => mats.push({ sec, m })));
    const missing = mats.filter((x) => !x.m.hasAudio).length;
    const engineOk = App.status && (App.status.edgeTts || App.status.sapi);

    body.innerHTML = `
      <div class="card card-pad">
        <div class="card-h">
          <h3>音频工作台</h3>
          <select id="au-set" style="max-width:420px">
            ${App.sets.map((s) => `<option value="${esc(s.id)}" ${s.id === set.id ? 'selected' : ''}>${esc(s.title)}（${s.audioHave || 0}/${s.audioTotal || 0}）</option>`).join('')}
          </select>
          <div class="spacer"></div>
          <span class="badge ${missing ? 'warn' : 'ok'}">${missing ? missing + ' 段缺音频' : '音频齐全'}</span>
        </div>

        <div class="row" style="gap:10px;margin-bottom:14px;align-items:flex-end">
          <label class="field" style="margin:0"><span>合成引擎</span>
            <select id="au-engine" style="min-width:190px">
              <option value="edge" ${st.engine === 'edge' ? 'selected' : ''} ${App.status && App.status.edgeTts ? '' : 'disabled'}>edge-tts 神经语音（在线，推荐）</option>
              <option value="sapi" ${st.engine === 'sapi' ? 'selected' : ''} ${App.status && App.status.sapi ? '' : 'disabled'}>Windows 本地语音（离线）</option>
            </select></label>
          <label class="field" style="margin:0"><span>男声</span><select id="au-male">${VOICES.male.map(([v, t]) => `<option value="${v}" ${st.maleVoice === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="field" style="margin:0"><span>女声</span><select id="au-female">${VOICES.female.map(([v, t]) => `<option value="${v}" ${st.femaleVoice === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="field" style="margin:0;width:110px"><span>语速</span><input type="text" id="au-rate" value="${st.rate}" placeholder="0"></label>
          <label class="field" style="margin:0;width:110px"><span>段间停顿(秒)</span><input type="text" id="au-gap" value="${st.gap}"></label>
          <label class="row tiny" style="gap:6px;padding-bottom:9px"><input type="checkbox" id="au-prompt" ${st.autoPrompt ? 'checked' : ''}> 生成中文指令音</label>
        </div>

        <div class="row" style="gap:10px">
          <button class="btn btn-primary" id="au-all" ${engineOk && missing ? '' : 'disabled'}>⚡ 一键生成缺失音频（${missing} 段）</button>
          <div class="spacer"></div>
          <span class="tiny muted" id="au-tip">${engineOk ? '合成会逐段进行，请勿关闭页面' : '未检测到可用语音引擎：请安装 Python + edge-tts，或直接上传音频'}</span>
        </div>
        <div class="progress-line" style="margin-top:12px"><i id="au-progress"></i></div>
      </div>
      <div style="margin-top:16px" id="au-list"></div>`;

    $('#au-set').onchange = (e) => { S.setId = e.target.value; paint(); };
    ['au-engine', 'au-male', 'au-female', 'au-rate', 'au-gap'].forEach((id) => {
      $('#' + id).onchange = () => {
        saveSettings({
          engine: $('#au-engine').value, maleVoice: $('#au-male').value, femaleVoice: $('#au-female').value,
          rate: Number($('#au-rate').value) || 0, gap: Number($('#au-gap').value) || 0.35
        });
      };
    });
    $('#au-prompt').onchange = (e) => saveSettings({ autoPrompt: e.target.checked });

    function matRowHTML(x, idx) {
      const { sec, m } = x;
      return `<div class="mat-row" data-mat="${esc(m.id)}" data-idx="${idx}">
        <div class="id">${esc(m.label || m.id)}<div class="tiny muted" style="font-weight:500">${sec.name}</div></div>
        <div class="body">
          <div class="row" style="gap:8px">
            <span class="au-status">${m.hasAudio ? badgen('已有音频', 'ok') : badgen('缺音频', 'warn')}</span>
            <span class="tiny muted">${m.questions.length} 题 · 原文 ${(m.transcript || '').length} 字</span>
            ${m.promptAudio ? '<span class="badge blue">含指令音</span>' : ''}
            <div class="spacer"></div>
            <span class="tiny muted au-msg"></span>
          </div>
          <div class="script-preview" title="点击编辑原文">${esc((m.transcript || '（无原文，可点"编辑原文"补上）').slice(0, 200))}</div>
          <div class="ops">
            <button class="btn btn-sm btn-primary" data-act="gen" ${m.transcript ? '' : 'disabled'}>⚡ 生成</button>
            <button class="btn btn-sm" data-act="upload">⬆ 上传音频</button>
            ${m.hasAudio ? '<button class="btn btn-sm" data-act="play">▶ 试听</button>' : ''}
            ${m.hasAudio ? '<button class="btn btn-sm btn-danger" data-act="del">删除</button>' : ''}
            <button class="btn btn-sm btn-ghost" data-act="edit">编辑原文</button>
            <a class="btn btn-sm btn-ghost" href="#/practice?set=${encodeURIComponent(set.id)}&mat=${encodeURIComponent(m.id)}">精听</a>
          </div>
          <input type="file" accept="audio/*" hidden>
        </div>
      </div>`;
    }

    $('#au-list').innerHTML = mats.map(matRowHTML).join('');

    function updateRow(idx) {
      const x = mats[idx];
      const row = $(`.mat-row[data-idx="${idx}"]`);
      if (!row) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = matRowHTML(x, idx);
      row.replaceWith(tmp.firstElementChild);
      bindRow(idx);
    }

    function bindRow(idx) {
      const x = mats[idx];
      const row = $(`.mat-row[data-idx="${idx}"]`);
      if (!row) return;
      const msg = $('.au-msg', row);
      row.querySelector('[data-act="gen"]').onclick = async () => {
        msg.textContent = '合成中…';
        await genOne(x, row, msg);
      };
      const upBtn = row.querySelector('[data-act="upload"]');
      const fileInput = row.querySelector('input[type=file]');
      upBtn.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const f = fileInput.files[0];
        if (!f) return;
        msg.textContent = '上传中…';
        const ext = (f.name.match(/\.[A-Za-z0-9]+$/) || ['.mp3'])[0];
        try {
          const buf = await f.arrayBuffer();
          const res = await fetch(`/api/upload/${encodeURIComponent(set.id)}/${encodeURIComponent(x.m.id)}?ext=${encodeURIComponent(ext)}`, { method: 'POST', body: buf });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || '上传失败');
          x.m.audio = data.url;
          x.m.hasAudio = true;
          x.m.__localAudio = true;
          toast('音频已上传', 'ok');
          updateRow(idx);
          refreshCounts();
        } catch (e) { msg.textContent = ''; toast('上传失败：' + e.message, 'bad'); }
      };
      const playBtn = row.querySelector('[data-act="play"]');
      if (playBtn) playBtn.onclick = () => {
        const a = new Audio(x.m.audio);
        a.play().catch(() => toast('播放失败', 'bad'));
        msg.textContent = '试听中…';
        a.onended = () => { msg.textContent = ''; };
      };
      const delBtn = row.querySelector('[data-act="del"]');
      if (delBtn) delBtn.onclick = async () => {
        await api.del(`/api/audio/${encodeURIComponent(set.id)}/${encodeURIComponent(x.m.id)}`);
        x.m.audio = '';
        x.m.hasAudio = false;
        if (x.m.promptAudio) { await api.del(`/api/audio/${encodeURIComponent(set.id)}/${encodeURIComponent(x.m.id + '.prompt')}`); x.m.promptAudio = ''; }
        updateRow(idx);
        refreshCounts();
        toast('已删除音频', 'ok');
      };
      row.querySelector('[data-act="edit"]').onclick = () => {
        modal({
          title: '编辑听力原文 · ' + (x.m.label || x.m.id),
          wide: true,
          body: `<p class="tiny muted" style="margin-bottom:8px">每行一句，用 <b>M:</b> / <b>W:</b> 开头可自动分角色配音（男声/女声）。</p>
            <textarea id="ed-script" rows="14" style="font-size:13.5px;line-height:1.7">${esc(x.m.transcript || '')}</textarea>`,
          actions: [
            { label: '取消' },
            {
              label: '保存并关闭', cls: 'btn-primary', onClick: async (mm) => {
                x.m.transcript = $('#ed-script', mm.el).value;
                await saveSetQuietly();
                updateRow(idx);
                toast('原文已保存', 'ok');
              }
            }
          ]
        });
      };
    }

    mats.forEach((_, i) => bindRow(i));

    async function saveSetQuietly() {
      const clean = JSON.parse(JSON.stringify(set));
      clean.sections.forEach((s) => s.materials.forEach((m) => { delete m.hasAudio; delete m.audio; delete m.promptAudio; }));
      await api.put('/api/sets/' + set.id, clean);
    }

    function refreshCounts() {
      const have = mats.filter((x) => x.m.hasAudio).length;
      const left = mats.length - have;
      const badge = $('.card-h .badge');
      if (badge) { badge.className = 'badge ' + (left ? 'warn' : 'ok'); badge.textContent = left ? left + ' 段缺音频' : '音频齐全'; }
      const allBtn = $('#au-all');
      if (allBtn) { allBtn.disabled = left === 0 || !engineOk; allBtn.textContent = `⚡ 一键生成缺失音频（${left} 段）`; }
    }

    function updateProgress(done, total) {
      $('#au-progress').style.width = (total ? done / total * 100 : 0) + '%';
    }

    async function genOne(x, row, msgEl, quiet) {
      const { sec, m } = x;
      const st2 = App.settings;
      if (!m.transcript) { toast('这段没有原文，无法合成', 'warn'); return false; }
      try {
        const res = await api.post('/api/tts', {
          setId: set.id, materialId: m.id, text: m.transcript, kind: 'material',
          engine: st2.engine, maleVoice: st2.maleVoice, femaleVoice: st2.femaleVoice,
          narratorVoice: st2.narratorVoice, rate: st2.rate, gap: st2.gap
        });
        m.audio = res.url;
        m.hasAudio = true;
        if (st2.autoPrompt) {
          try {
            const p = await api.post('/api/tts', {
              setId: set.id, materialId: m.id + '.prompt', text: promptTextOf(sec, m), kind: 'prompt',
              engine: st2.engine, narratorVoice: st2.narratorVoice, rate: st2.rate
            });
            m.promptAudio = p.url;
          } catch (e) { console.warn('指令音生成失败', e); }
        }
        if (!quiet) {
          const idx = Number(row.dataset.idx);
          updateRow(idx);
          refreshCounts();
          toast(`已生成：${m.label || m.id}（${res.duration ? Math.round(res.duration) + ' 秒' : 'ok'}）`, 'ok');
        } else if (msgEl) {
          msgEl.textContent = '完成';
        }
        return true;
      } catch (e) {
        if (msgEl) msgEl.textContent = '失败';
        if (!quiet) toast('合成失败：' + e.message, 'bad');
        return false;
      }
    }

    $('#au-all').onclick = async () => {
      if (S.running) return;
      const todo = mats.map((x, i) => ({ x, i })).filter(({ x }) => !x.m.hasAudio);
      if (!todo.length) { toast('没有缺失音频', 'ok'); return; }
      S.running = true;
      const btn = $('#au-all');
      btn.disabled = true;
      let done = 0;
      let fail = 0;
      for (const { x, i } of todo) {
        const row = $(`.mat-row[data-idx="${i}"]`);
        const msg = row ? $('.au-msg', row) : null;
        if (msg) msg.textContent = `合成中… (${done + 1}/${todo.length})`;
        btn.textContent = `合成中 ${done + 1}/${todo.length} …`;
        const ok = await genOne(x, row, msg, true);
        if (ok) { done += 1; if (row) updateRow(i); }
        else fail += 1;
        updateProgress(done + fail, todo.length);
      }
      S.running = false;
      refreshCounts();
      toast(`完成 ${done} 段${fail ? '，失败 ' + fail + ' 段（可重试或改用上传）' : ''}`, fail ? 'warn' : 'ok');
    };
  }

  /* ---------------------------------------------------------- 设置 */

  function paintSettings(body) {
    const st = App.settings;
    body.innerHTML = `
      <div class="card card-pad" style="max-width:720px">
        <div class="card-h"><h3>界面与考试设置</h3></div>
        <label class="field"><span>字号（${st.fontSize}px）</span>
          <input type="range" id="s-font" min="14" max="22" step="1" value="${st.fontSize}" style="width:100%"></label>
        <label class="field"><span>考试中是否允许看到对错（默认关闭，模拟真实机考）</span>
          <select id="s-hide"><option value="1" ${st.hideAnswerWhileExam ? 'selected' : ''}>不显示对错（推荐）</option>
          <option value="0" ${!st.hideAnswerWhileExam ? 'selected' : ''}>显示对错</option></select></label>
        <label class="field"><span>默认播放遍数（真实考试：2 遍）</span>
          <select id="s-plays"><option value="2" ${st.examPlays !== 1 ? 'selected' : ''}>2 遍</option><option value="1" ${st.examPlays === 1 ? 'selected' : ''}>1 遍</option></select></label>
        <div class="hr"></div>
        <div class="tiny" style="font-weight:700;color:var(--ink-2);margin-bottom:10px">机考流程时间</div>
        <div class="row" style="gap:14px;align-items:flex-start">
          <label class="field" style="flex:1"><span>开考前阅卷（秒）</span>
            <input type="text" id="s-read" value="${st.readSec}" placeholder="120"></label>
          <label class="field" style="flex:1"><span>考后检查修改（秒）</span>
            <input type="text" id="s-review" value="${st.reviewSec}" placeholder="120"></label>
          <label class="field" style="flex:1"><span>每段录音结束作答（秒）</span>
            <input type="text" id="s-answer" value="${st.answerSec}" placeholder="5"></label>
        </div>
        <label class="field"><span>每段录音前的提示音（"叮咚"）</span>
          <select id="s-cue"><option value="1" ${st.cueSound !== false ? 'selected' : ''}>播放（推荐，与真实录音一致）</option>
          <option value="0" ${st.cueSound === false ? 'selected' : ''}>静音</option></select></label>
        <div class="row" style="gap:8px;margin-bottom:6px">
          <button class="btn btn-sm" id="s-cue-test">🔔 试听提示音</button>
          <span class="tiny muted">提示音文件：data/audio/_cue.wav（可用 tools/make_cue.py 重新生成）</span>
        </div>
        <div class="hr"></div>
        <div class="row tiny muted" style="flex-direction:column;align-items:flex-start;gap:6px">
          <div>服务端：Node ${esc((App.status && App.status.node) || '?')}　Python：${esc((App.status && App.status.python) || '未检测到')}　edge-tts：${App.status && App.status.edgeTts ? '可用' : '不可用'}</div>
          <div>题库文件：<span class="mono">gk-listening/data/sets/</span>　音频：<span class="mono">gk-listening/data/audio/</span></div>
          <div>版本 ${App.version}　·　数据全部保存在本机，不上传云端</div>
        </div>
      </div>`;
    $('#s-font').oninput = (e) => saveSettings({ fontSize: Number(e.target.value) });
    $('#s-hide').onchange = (e) => saveSettings({ hideAnswerWhileExam: e.target.value === '1' });
    $('#s-plays').onchange = (e) => saveSettings({ examPlays: Number(e.target.value) });
    $('#s-read').onchange = (e) => saveSettings({ readSec: Math.max(0, Math.min(600, Number(e.target.value) || 0)) });
    $('#s-review').onchange = (e) => saveSettings({ reviewSec: Math.max(0, Math.min(600, Number(e.target.value) || 0)) });
    $('#s-answer').onchange = (e) => saveSettings({ answerSec: Math.max(1, Math.min(60, Number(e.target.value) || 5)) });
    $('#s-cue').onchange = (e) => saveSettings({ cueSound: e.target.value === '1' });
    $('#s-cue-test').onclick = () => Cue.play();
  }

  renderShell();
};
