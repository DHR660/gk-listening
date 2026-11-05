/* 成绩报告 */
'use strict';

Views.report = async function (params, app) {
  let rec = window.__lastRecord && window.__lastRecord.id === params.id
    ? window.__lastRecord
    : App.records.find((r) => r.id === params.id);
  if (!rec) {
    try { await loadRecords(); } catch (_) { /* ignore */ }
    rec = App.records.find((r) => r.id === params.id);
  }
  if (!rec) {
    app.innerHTML = shell(`<div class="card card-pad empty"><div class="big">🧾</div><h3>找不到这份成绩单</h3>
      <p class="muted" style="margin:10px 0 18px">它可能已被删除。</p><a class="btn btn-primary" href="#/history">查看全部记录</a></div>`, 'history');
    return;
  }
  const set = getSet(rec.setId);
  const detail = rec.detail || [];
  const full = rec.full || 30;
  const pct = Math.round(rec.score / full * 100);
  const wrongs = detail.filter((d) => !d.ok);
  const duration = rec.duration || 0;

  // 按小节统计
  const secMap = {};
  if (set) {
    flatten(set).forEach((it) => { secMap[it.no] = it.sec.name; });
  }
  const secStats = {};
  detail.forEach((d) => {
    const name = secMap[d.no] || '未分节';
    secStats[name] = secStats[name] || { right: 0, total: 0 };
    secStats[name].total += 1;
    if (d.ok) secStats[name].right += 1;
  });

  const level = pct >= 90 ? { t: '优秀', cls: 'ok' } : pct >= 75 ? { t: '良好', cls: 'blue' } : pct >= 60 ? { t: '及格', cls: 'warn' } : { t: '需加强', cls: 'bad' };

  // 逐题（按材料分组）
  const groups = [];
  if (set) {
    set.sections.forEach((sec) => sec.materials.forEach((m) => {
      const qs = m.questions.filter((q) => detail.some((d) => d.no === q.no));
      if (qs.length) groups.push({ sec, mat: m, qs });
    }));
  }

  const reviewHTML = groups.map((g, gi) => {
    const qsHTML = g.qs.map((q) => {
      const d = detail.find((x) => x.no === q.no) || { mine: '', ans: q.answer, ok: false };
      const opts = Object.keys(q.options).filter((k) => q.options[k]).map((k) => {
        let cls = '';
        if (k === q.answer) cls = 'right';
        else if (k === d.mine) cls = 'wrong';
        return `<div class="opt ${cls}"><span class="k">${k}</span><span>${esc(q.options[k])}</span></div>`;
      }).join('');
      return `<div class="rev-item">
        <div class="rv-head">
          <span class="no">第 ${q.no} 题</span>
          ${d.ok ? badgen('正确', 'ok') : badgen('错误', 'bad')}
          <span class="ans">你的答案：<b style="color:${d.ok ? '#12a150' : '#e03131'}">${esc(d.mine || '未答')}</b>　正确答案：<b style="color:#12a150">${esc(q.answer)}</b></span>
          <div class="spacer"></div>
          <button class="btn btn-sm btn-ghost" data-script="${gi}">看原文</button>
        </div>
        <div class="q-text">${esc(q.text)}</div>
        <div class="opts">${opts}</div>
        <div class="script" id="rev-script-${gi}" style="display:none">${scriptHTML(g.mat.transcript)}</div>
      </div>`;
    }).join('');
    return `<div class="card card-pad" style="margin-top:16px">
      <div class="card-h" style="margin-bottom:10px">
        <h3>${esc(g.sec.name)} · ${esc(g.mat.label || g.mat.id)}</h3>
        <span class="tiny muted">第 ${g.qs[0].no}–${g.qs[g.qs.length - 1].no} 题</span>
        <div class="spacer"></div>
        <button class="btn btn-sm" data-play="${esc(g.mat.id)}">▶ 听这段</button>
      </div>
      <div class="q-review">${qsHTML}</div>
    </div>`;
  }).join('');

  app.innerHTML = shell(`
    <div class="row" style="margin-bottom:14px">
      <a class="btn btn-sm" href="#/home">← 首页</a>
      <div class="spacer"></div>
      <button class="btn btn-sm" onclick="window.print()">打印成绩单</button>
    </div>
    <div class="score-hero">
      <div>
        <div class="score-big">${rec.score}<small> / ${full}</small></div>
        <div class="row" style="margin-top:10px;gap:8px">
          ${badgen(level.t, level.cls)}
          ${rec.auto ? badgen('自动收卷', 'blue') : badgen('手动交卷', '')}
          ${rec.blurred ? badgen(`离开页面 ${rec.blurred} 次`, 'warn') : ''}
        </div>
      </div>
      <div class="score-meta">
        <div>正确率<b>${rec.right}/${rec.total}（${Math.round(rec.right / rec.total * 100)}%）</b></div>
        <div>用时<b>${fmtTime(duration)}</b></div>
        ${Object.keys(secStats).map((k) => `<div>${esc(k)}<b>${secStats[k].right}/${secStats[k].total}</b></div>`).join('')}
        <div>考生<b>${esc(rec.name || '—')}</b></div>
      </div>
      <div class="spacer"></div>
      <div class="row" style="gap:10px">
        <a class="btn" href="#/practice?set=${encodeURIComponent(rec.setId)}">精听这套</a>
        <a class="btn btn-primary" href="#/pre?set=${encodeURIComponent(rec.setId)}&mode=${encodeURIComponent(rec.mode || 'full')}">再考一次</a>
      </div>
    </div>

    ${wrongs.length ? `
    <div class="card card-pad" style="margin-top:16px">
      <div class="card-h"><h3>错题速览</h3><div class="spacer"></div>
        <span class="tiny muted">共 ${wrongs.length} 题　已自动加入错题本</span></div>
      <div class="row" style="gap:8px">
        ${wrongs.map((d) => `<span class="badge bad" style="font-size:13px;padding:5px 11px">第 ${d.no} 题　你选 ${esc(d.mine || '—')} → 答案 ${esc(d.ans)}</span>`).join('')}
      </div>
    </div>` : `<div class="card card-pad" style="margin-top:16px"><div class="row"><span style="font-size:22px">🎉</span>
      <b>全部答对！</b><span class="muted tiny">这一套听力你已经拿下，去挑战下一套吧。</span></div></div>`}

    <div class="section-title"><h2>逐题精析</h2><span>可展开原文，对照关键信息</span></div>
    ${reviewHTML || '<div class="card card-pad muted">这套试卷没有留下逐题数据。</div>'}
  `, 'history');

  $$('[data-script]').forEach((b) => {
    b.onclick = () => {
      const el = $('#rev-script-' + b.dataset.script);
      const show = el.style.display === 'none';
      el.style.display = show ? 'block' : 'none';
      b.textContent = show ? '收起原文' : '看原文';
    };
  });

  // 内联播放该段音频
  let inlineAudio = null;
  $$('[data-play]').forEach((b) => {
    b.onclick = () => {
      const matId = b.dataset.play;
      const all = set ? set.sections.flatMap((s) => s.materials) : [];
      const mat = all.find((m) => m.id === matId);
      if (!mat || !audioSrc(set, mat)) { toast('这段没有音频', 'warn'); return; }
      if (!inlineAudio) inlineAudio = new Audio();
      if (!inlineAudio.paused) { inlineAudio.pause(); b.textContent = '▶ 听这段'; return; }
      inlineAudio.src = audioSrc(set, mat);
      inlineAudio.play();
      b.textContent = '⏸ 暂停';
      inlineAudio.onended = () => { b.textContent = '▶ 听这段'; };
    };
  });
};
