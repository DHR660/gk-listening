/* 学习数据：成绩记录 + 错题本 */
'use strict';

function drawChart(canvas, data) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 800;
  const H = canvas.clientHeight || 180;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  if (!data.length) {
    ctx.fillStyle = '#98a2b3';
    ctx.font = '13px sans-serif';
    ctx.fillText('还没有模考记录', 12, H / 2);
    return;
  }
  const pad = { l: 34, r: 12, t: 12, b: 22 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const max = 30;
  // 网格
  ctx.strokeStyle = '#eef2f7';
  ctx.lineWidth = 1;
  for (let v = 0; v <= max; v += 10) {
    const y = pad.t + ch - (v / max) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(W - pad.r, y);
    ctx.stroke();
    ctx.fillStyle = '#98a2b3';
    ctx.font = '11px sans-serif';
    ctx.fillText(String(v), 8, y + 4);
  }
  const n = data.length;
  const step = cw / n;
  const bw = Math.min(26, step * 0.62);
  data.forEach((d, i) => {
    const x = pad.l + step * i + (step - bw) / 2;
    const h = Math.max(2, (d.score / max) * ch);
    const y = pad.t + ch - h;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (d.score >= 27) { g.addColorStop(0, '#37d67a'); g.addColorStop(1, '#12a150'); }
    else if (d.score >= 21) { g.addColorStop(0, '#4f8bff'); g.addColorStop(1, '#1e5eff'); }
    else { g.addColorStop(0, '#ffb84d'); g.addColorStop(1, '#f79009'); }
    ctx.fillStyle = g;
    ctx.beginPath();
    const r = 4;
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + bw - r, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
    ctx.lineTo(x + bw, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#475467';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(d.score), x + bw / 2, y - 4);
    ctx.textAlign = 'left';
  });
}

Views.history = async function (params, app) {
  await loadRecords();
  const recs = App.records.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const full = recs.filter((r) => (r.mode || 'full') === 'full');
  const chartData = full.slice(0, 20).reverse();
  const wrong = WrongBook.list();
  const avg = full.length ? full.reduce((a, r) => a + r.score, 0) / full.length : 0;
  const best = full.length ? Math.max.apply(null, full.map((r) => r.score)) : 0;

  app.innerHTML = shell(`
    <div class="section-title"><h2>学习数据</h2><span>成绩记录与错题本（保存在本机）</span></div>

    <div class="stat-grid" style="margin-top:10px">
      <div class="stat"><b>${recs.length}</b><span>总练习次数</span></div>
      <div class="stat"><b>${avg ? avg.toFixed(1) : '—'}</b><span>模考平均分</span></div>
      <div class="stat"><b>${best || '—'}</b><span>最高分 / 30</span></div>
      <div class="stat"><b>${wrong.length}</b><span>错题数量</span></div>
    </div>

    <div class="card card-pad" style="margin-top:16px">
      <div class="card-h"><h3>最近 ${chartData.length} 次模考成绩</h3><div class="spacer"></div>
        <span class="tiny muted">满分 30</span></div>
      <canvas id="score-chart" style="width:100%;height:190px"></canvas>
    </div>

    <div class="card card-pad" style="margin-top:16px">
      <div class="card-h"><h3>练习记录</h3><div class="spacer"></div>
        <button class="btn btn-sm btn-danger" id="clear-rec">清空记录</button></div>
      ${recs.length ? `<table class="tbl"><thead><tr><th>时间</th><th>试卷</th><th>范围</th><th>得分</th><th>正确率</th><th>用时</th><th>操作</th></tr></thead>
        <tbody>${recs.map((r) => `<tr>
          <td class="tiny">${fmtDate(r.at)}<div class="tiny muted">${fmtAgo(r.at)}</div></td>
          <td>${esc(r.setName || r.setId)}</td>
          <td class="tiny">${(r.mode || 'full') === 'full' ? '全卷' : '分节'}</td>
          <td class="num"><b>${r.score}</b> / ${r.full || 30}</td>
          <td class="num">${Math.round((r.right || 0) / (r.total || 20) * 100)}%</td>
          <td class="num tiny">${fmtTime(r.duration)}</td>
          <td><div class="row" style="gap:6px">
            <a class="btn btn-sm" href="#/report?id=${encodeURIComponent(r.id)}">报告</a>
            <button class="btn btn-sm btn-danger" data-del="${esc(r.id)}">删</button>
          </div></td>
        </tr>`).join('')}</tbody></table>`
        : '<div class="empty"><div class="big">📈</div><p>还没有记录，先做一套模考吧</p><a class="btn btn-primary" style="margin-top:12px" href="#/home">去模考</a></div>'}
    </div>

    <div class="card card-pad" style="margin-top:16px">
      <div class="card-h"><h3>错题本（${wrong.length}）</h3><div class="spacer"></div>
        ${wrong.length ? '<button class="btn btn-sm btn-danger" id="clear-wrong">清空错题</button>' : ''}</div>
      ${wrong.length ? `<table class="tbl"><thead><tr><th>试卷</th><th>题号</th><th>你的答案</th><th>正确答案</th><th>错次</th><th>最近一次</th><th>操作</th></tr></thead>
        <tbody>${wrong.map((w) => {
          const s = getSet(w.setId);
          const mat = s ? s.sections.flatMap((x) => x.materials).find((m) => m.questions.some((q) => q.no === w.no)) : null;
          return `<tr>
            <td class="tiny">${esc(w.setName || w.setId)}</td>
            <td>第 ${w.no} 题</td>
            <td><b style="color:#e03131">${esc(w.mine || '未答')}</b></td>
            <td><b style="color:#12a150">${esc(w.ans)}</b></td>
            <td class="num">${w.count}</td>
            <td class="tiny">${fmtDate(w.lastAt)}</td>
            <td><div class="row" style="gap:6px">
              ${mat ? `<a class="btn btn-sm" href="#/practice?set=${encodeURIComponent(w.setId)}&mat=${encodeURIComponent(mat.id)}">去精听</a>` : ''}
              <button class="btn btn-sm btn-danger" data-wrong="${esc(w.setId)}#${w.no}">移除</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody></table>`
        : '<div class="empty"><div class="big">✅</div><p>错题本是空的，保持住！</p></div>'}
    </div>
  `, 'history');

  const canvas = $('#score-chart');
  drawChart(canvas, chartData);
  window.addEventListener('resize', () => drawChart(canvas, chartData), { once: true });

  $('#clear-rec').onclick = async () => {
    const ok = await confirmDialog('清空记录', '将删除全部练习记录（错题本不受影响）。', { danger: true, okText: '清空' });
    if (!ok) return;
    await api.del('/api/records', { all: true });
    App.records = [];
    toast('已清空', 'ok');
    Views.history(params, app);
  };
  $$('[data-del]').forEach((b) => {
    b.onclick = async () => {
      await api.del('/api/records', { id: b.dataset.del });
      await loadRecords();
      toast('已删除', 'ok');
      Views.history(params, app);
    };
  });
  const cw = $('#clear-wrong');
  if (cw) cw.onclick = async () => {
    const ok = await confirmDialog('清空错题本', '确定清空全部错题记录？', { danger: true, okText: '清空' });
    if (!ok) return;
    WrongBook.clear();
    Views.history(params, app);
  };
  $$('[data-wrong]').forEach((b) => {
    b.onclick = () => {
      const [setId, no] = b.dataset.wrong.split('#');
      WrongBook.remove(setId, Number(no));
      Views.history(params, app);
    };
  });
};
