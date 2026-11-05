/* ============================================================================
 * 听力材料 / 试卷文本 → 题库 JSON 的智能解析器
 * 支持两种常见排版：
 *   A. 讲义式（推荐）：Text 1 / 材料1 分段，原文与题目在一起
 *   B. 试卷式：前半部分是 1–20 题（题干+选项+答案），末尾"听力原文"含 Text 1…Text 10
 * 解析结果允许在界面上再编辑（JSON 微调）。
 * ==========================================================================*/
'use strict';

const Parser = (function () {
  const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15 };

  function cnToNum(s) {
    if (/^\d+$/.test(s)) return Number(s);
    if (CN_NUM[s] != null) return CN_NUM[s];
    if (/^十[一二三四五]$/.test(s)) return 10 + CN_NUM[s.slice(1)];
    if (/^[一二三四五六七八九]十$/.test(s)) return CN_NUM[s[0]] * 10;
    return null;
  }

  function normalize(text) {
    let t = String(text || '').replace(/^\uFEFF/, '');
    t = t.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    t = t.replace(/\u00a0|\u3000/g, ' ');
    t = t.replace(/[．｡]/g, '.');
    t = t.replace(/：/g, ':').replace(/，/g, ',').replace(/（/g, '(').replace(/）/g, ')');
    t = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
    t = t.replace(/[\u2013\u2014]/g, '-');
    t = t.replace(/\r\n?/g, '\n');
    t = t.split('\n').filter((l) => !/^\s*(英语|听力|第\s*\d+\s*页|共\s*\d+\s*页|绝密|试卷第|版权所有)/.test(l) || /答案|原文/.test(l)).join('\n');
    t = t.replace(/[ \t]+/g, ' ');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  /* ------------------------------------------------------------ 答案 ---- */

  const ANSWER_LINE_RE = /^(?:参考)?答案\s*[:：]?\s*([A-D])(?![A-Za-z])/i;

  function parseAnswers(text) {
    const map = {};
    const lines = text.split('\n');
    const region = [];
    let inAnswer = false;
    for (const raw of lines) {
      const l = raw.trim();
      if (/^(参考)?答案|^Answer/i.test(l)) { inAnswer = true; region.push(l); continue; }
      if (inAnswer) {
        if (/^[一二三四五六七八九十]+、|^第[一二三四五六七八九十]+节|听力原文|录音原文|^Text\s*\d/i.test(l)) inAnswer = false;
        else region.push(l);
      }
    }
    if (!region.length) {
      for (const raw of lines) {
        const l = raw.trim();
        if (l.length <= 60 && /[A-D]/.test(l) && !/[A-Za-z]{4,}/.test(l.replace(/[A-D]/g, ''))) region.push(l);
      }
    }
    const blob = region.join(' ');
    let m;
    const rangeRe = /(?:^|[^0-9])(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*[:.]?\s*([A-D](?:\s*[A-D]){1,})/g;
    while ((m = rangeRe.exec(blob))) {
      const from = Number(m[1]);
      const to = Number(m[2]);
      const letters = m[3].replace(/\s+/g, '');
      if (to - from + 1 !== letters.length) continue;
      for (let i = 0; i < letters.length; i++) map[from + i] = letters[i];
    }
    const pairRe = /(\d{1,2})\s*[.、:)）]?\s*[-]?\s*([A-D])(?![A-Za-z])/g;
    while ((m = pairRe.exec(blob))) {
      const no = Number(m[1]);
      if (no >= 1 && no <= 40 && !map[no]) map[no] = m[2];
    }
    return map;
  }

  /* ------------------------------------------------------------ 选项 ---- */

  function splitInlineOptions(line) {
    const re = /(?:^|[\s,;])([A-D])\s*[.、:)]\s*/g;
    const marks = [];
    let m;
    while ((m = re.exec(line))) marks.push({ key: m[1], start: m.index, end: re.lastIndex });
    if (marks.length < 2) return null;
    const res = {};
    marks.forEach((mk, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].start : line.length;
      const v = line.slice(mk.end, end).trim();
      if (v) res[mk.key] = v;
    });
    return Object.keys(res).length >= 2 ? res : null;
  }

  const QSTART_RE = /^\s*(\d{1,2})\s*[.、)]\s*(.*)$/;
  const OPT_RE = /^\s*([A-D])\s*[.、)]\s*(.*)$/;

  function parseQuestions(text, answerMap) {
    const lines = text.split('\n');
    const out = [];
    let cur = null;

    const push = () => {
      if (!cur) return;
      if (Object.keys(cur.options).length >= 2) out.push(cur);
      cur = null;
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      const qm = QSTART_RE.exec(line);
      if (qm) {
        const no = Number(qm[1]);
        if (no >= 1 && no <= 40 && (!cur || no > cur.no)) {
          push();
          cur = { no, text: qm[2].trim(), options: {}, answer: '', extra: '' };
          const inline = splitInlineOptions(cur.text);
          if (inline) { cur.options = inline; cur.text = cur.text.split(/(?:^|[\s,;])[A-D]\s*[.、:)]/)[0].trim(); }
          continue;
        }
      }
      if (!cur) continue;

      const am = ANSWER_LINE_RE.exec(line);
      if (am) { cur.answer = am[1]; continue; }

      const om = OPT_RE.exec(line);
      if (om) { cur.options[om[1]] = om[2].trim(); continue; }

      if (Object.keys(cur.options).length === 0) {
        const inline = splitInlineOptions(line);
        if (inline) { cur.options = inline; continue; }
        if (cur.text.length < 300) cur.text += ' ' + line;
      } else {
        cur.extra += ' ' + line;
      }
    }
    push();

    // 补答案 + 去重（同一题号保留信息更全的一条）
    const byNo = {};
    out.forEach((q) => {
      if (!q.answer && answerMap[q.no]) q.answer = answerMap[q.no];
      const old = byNo[q.no];
      const score = Object.keys(q.options).length * 10 + q.text.length + (q.extra ? 30 : 0);
      const oldScore = old ? Object.keys(old.options).length * 10 + old.text.length + (old.extra ? 30 : 0) : -1;
      if (!old || score > oldScore) byNo[q.no] = q;
    });
    return Object.keys(byNo).map((k) => byNo[k]).sort((a, b) => a.no - b.no);
  }

  /* ------------------------------------------------------- 原文分块 ---- */

  const BLOCK_PATTERNS = [
    /^\s*(?:text|conversation|dialogue|passage|monologue|script|listening material)\s*#?\s*(\d{1,2})\b/i,
    /^\s*(?:听力材料|录音材料|材料|对话|独白|短文|段落)\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[.、:：]?\s*$/,
    /^\s*(?:听力材料|录音材料|材料|对话|独白|短文|段落)\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[.、:：]/,
    /^\s*第\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*(?:段|则|篇)\s*(?:材料|对话|独白|短文)?\s*[.、:：]?\s*$/
  ];

  function blockNoOf(line) {
    for (const re of BLOCK_PATTERNS) {
      const m = re.exec(line);
      if (m) {
        const n = cnToNum(m[1]);
        if (n) return n;
      }
    }
    return null;
  }

  function countBlockMarkers(text) {
    let n = 0;
    text.split('\n').forEach((l) => { if (blockNoOf(l.trim()) != null) n += 1; });
    return n;
  }

  function splitBlocks(text) {
    const lines = text.split('\n');
    const starts = [];
    lines.forEach((l, i) => {
      const n = blockNoOf(l.trim());
      if (n != null) starts.push({ i, n });
    });
    const blocks = [];
    for (let k = 0; k < starts.length; k++) {
      const from = starts[k].i + 1;
      const to = k + 1 < starts.length ? starts[k + 1].i : lines.length;
      const body = lines.slice(from, to).join('\n').trim();
      blocks.push({ no: starts[k].n, text: body });
    }
    return blocks;
  }

  function paragraphs(text) {
    return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }

  function groupTo(parts, target) {
    const arr = parts.slice();
    if (target <= 0 || arr.length <= target) return arr;
    while (arr.length > target) {
      let best = 0;
      let bestLen = Infinity;
      for (let i = 0; i < arr.length - 1; i++) {
        const len = arr[i].length + arr[i + 1].length;
        if (len < bestLen) { bestLen = len; best = i; }
      }
      arr.splice(best, 2, arr[best] + '\n' + arr[best + 1]);
    }
    return arr;
  }

  /** 把一段"混合文本"里的题目/选项/答案/中文指令行剥掉，只留原文 */
  function stripQuestionLines(text) {
    return text.split('\n').filter((raw) => {
      const l = raw.trim();
      if (!l) return true;
      if (QSTART_RE.test(l) && Number(QSTART_RE.exec(l)[1]) <= 40) return false;
      if (OPT_RE.test(l)) return false;
      if (ANSWER_LINE_RE.test(l)) return false;
      if (/^(听下面|听第|第一节|第二节|第一部分|第二部分|例[:：])/.test(l)) return false;
      return true;
    }).join('\n').replace(/\n{2,}/g, '\n').trim();
  }

  function questionNumbersIn(text) {
    const out = [];
    text.split('\n').forEach((raw) => {
      const l = raw.trim();
      const m = QSTART_RE.exec(l);
      if (m) {
        const n = Number(m[1]);
        if (n >= 1 && n <= 40) out.push(n);
      }
    });
    return out;
  }

  function findTranscriptStart(text) {
    const re = /(听力原文|录音原文|听力材料原文|听力文稿|录音稿|tapescript|transcript|原文如下)/gi;
    let m;
    let idx = -1;
    while ((m = re.exec(text))) idx = m.index;
    return idx;
  }

  /* ----------------------------------------------------------- 标题 ---- */

  function guessTitle(raw, given) {
    if (given && given.trim()) return given.trim();
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
    for (const l of lines) {
      if (/^#{1,4}\s*/.test(l)) return l.replace(/^#{1,4}\s*/, '').replace(/^(标题|试卷|题目)[:：]\s*/, '');
      if (/(听力|试题|试卷|高考|模拟|月考|联考|真题|训练|Unit|Module)/i.test(l) && l.length <= 60 && !/^[0-9]/.test(l)) return l;
    }
    return '';
  }

  function guessYear(raw, given) {
    if (given) return Number(given) || '';
    const m = /(20\d{2})\s*年/.exec(raw);
    return m ? Number(m[1]) : '';
  }

  function makeId(title) {
    let id = 'set' + Date.now().toString(36).slice(-5);
    const t = String(title || '');
    const y = (t.match(/20\d{2}/) || [])[0];
    if (y && /真题|高考/.test(t)) id = 'gk' + y + '-x';
    return id.replace(/[^A-Za-z0-9\-_]/g, '');
  }

  const SEC1_DESC = '听下面5段对话。每段对话后有一个小题，从题中所给的A、B、C三个选项中选出最佳选项。听完每段对话后，你都有10秒钟的时间来回答有关小题和阅读下一小题。每段对话读两遍。';
  const SEC2_DESC = '听下面5段对话或独白。每段对话或独白后有几个小题，从题中所给的A、B、C三个选项中选出最佳选项。听每段对话或独白前，你将有时间阅读各个小题，每小题5秒钟；听完后，各小题将给出5秒钟的作答时间。每段对话或独白读两遍。';

  function mkMaterial(qs, transcript) {
    const first = qs[0] ? qs[0].no : 1;
    const last = qs[qs.length - 1] ? qs[qs.length - 1].no : first;
    return {
      id: 'm' + first,
      label: first === last ? '第' + first + '题材料' : '第' + first + '-' + last + '题材料',
      transcript: transcript || '',
      questions: qs.map((q) => ({
        no: q.no,
        text: q.text,
        options: {
          A: q.options.A || '', B: q.options.B || '', C: q.options.C || '',
          ...(q.options.D ? { D: q.options.D } : {})
        },
        answer: String(q.answer || '').toUpperCase()
      }))
    };
  }

  function splitIntoSections(mats) {
    const sec1 = mats.filter((m) => m.questions.every((q) => q.no <= 5));
    const sec2 = mats.filter((m) => !m.questions.every((q) => q.no <= 5));
    const sections = [];
    if (sec1.length) sections.push({ id: 'sec1', name: '第一节', plays: 2, desc: SEC1_DESC, materials: sec1 });
    if (sec2.length) sections.push({ id: 'sec2', name: '第二节', plays: 2, desc: SEC2_DESC, materials: sec2 });
    return sections;
  }

  /* ------------------------------------------------------------- 主流程 ---- */

  function parse(rawText, opts) {
    const o = opts || {};
    const warnings = [];
    const text = normalize(rawText);
    if (text.length < 20) return { ok: false, warnings: ['文本太短，无法解析'] };

    const answerMap = parseAnswers(text);
    const tStart = findTranscriptStart(text);
    let examText = text;
    let scriptText = '';
    if (tStart > 0) {
      examText = text.slice(0, tStart);
      scriptText = text.slice(tStart).replace(/^(【[^】]*】)?\s*(听力原文|录音原文|听力材料原文|听力文稿|录音稿|tapescript|transcript)[:：]?\s*/i, '');
    }

    const questions = parseQuestions(examText, answerMap);
    if (!questions.length) {
      return {
        ok: false,
        warnings: ['没有解析出题目：请确认文本里有 "1. 题干"、"A. 选项" 这样的结构。'],
        preview: { examText, scriptText }
      };
    }

    const qmap = {};
    questions.forEach((q) => { qmap[q.no] = q; });
    const total = questions.length;
    const useSec1 = total > 5;

    const missingAnswer = questions.filter((q) => !q.answer);
    if (missingAnswer.length) warnings.push('第 ' + missingAnswer.map((q) => q.no).join('、') + ' 题缺少答案，可在预览的 JSON 里补上。');
    const missingOpt = questions.filter((q) => Object.keys(q.options).length < 2);
    if (missingOpt.length) warnings.push('第 ' + missingOpt.map((q) => q.no).join('、') + ' 题选项不完整。');

    // ---- 原文分块 ----
    let mats = [];
    let blocks = [];
    let mode = 'none';

    if (scriptText) {
      const markerCount = countBlockMarkers(scriptText);
      let raw;
      if (markerCount >= 2) {
        raw = splitBlocks(scriptText).map((b) => ({ text: b.text, nums: questionNumbersIn(b.text) }));
        mode = 'end-marked';
      } else {
        const p = paragraphs(scriptText);
        const target = total >= 10 ? 10 : total;
        raw = groupTo(p, target).map((t) => ({ text: t, nums: questionNumbersIn(t) }));
        mode = 'end-plain';
        warnings.push('原文里没有 "Text 1 / 材料1" 这类小标题，已按段落自动切分（建议在预览里核对每段是否对应正确）。');
      }
      blocks = raw;

      // 如果原文块里能识别出题号，按题号精确绑定
      const withNums = blocks.filter((b) => b.nums.length && b.nums.some((n) => qmap[n]));
      if (withNums.length) {
        withNums.forEach((b) => {
          const qs = b.nums.filter((n) => qmap[n]).filter((n, i, a) => a.indexOf(n) === i).map((n) => qmap[n]).sort((x, y) => x.no - y.no);
          const t = stripQuestionLines(b.text);
          if (qs.length) mats.push(mkMaterial(qs, t));
        });
      } else {
        // 回退：第一节一题一段，第二节按 2/2/3/4/4 分组
        const transcripts = blocks.map((b) => stripQuestionLines(b.text));
        const s1 = questions.filter((q) => q.no <= 5);
        s1.forEach((q, i) => mats.push(mkMaterial([q], transcripts[i] || '')));
        const s2 = questions.filter((q) => q.no > 5);
        if (s2.length) {
          const sizes = s2.length === 15 ? [2, 2, 3, 4, 4] : (() => {
            const per = Math.max(1, Math.round(s2.length / 5));
            const arr = [];
            for (let i = 0; i < 5; i++) arr.push(per);
            return arr;
          })();
          let p = 0;
          sizes.forEach((size, i) => {
            const g = s2.slice(p, p + size);
            p += size;
            if (g.length) mats.push(mkMaterial(g, transcripts[5 + i] || ''));
          });
          if (p < s2.length) mats[mats.length - 1].questions = mats[mats.length - 1].questions.concat(s2.slice(p));
        }
      }
    } else {
      // 没有单独的"听力原文"区：尝试按整篇里的 Text N 标记做混合解析
      const markerCount = countBlockMarkers(text);
      if (markerCount >= 3) {
        const raw = splitBlocks(text);
        raw.forEach((b) => {
          const qs = questionNumbersIn(b.text).filter((n) => qmap[n])
            .filter((n, i, a) => a.indexOf(n) === i).map((n) => qmap[n]).sort((x, y) => x.no - y.no);
          if (!qs.length) return;
          mats.push(mkMaterial(qs, stripQuestionLines(b.text)));
        });
        mode = 'inline';
      }
    }

    // 兜底：没有拿到任何原文块 → 按题号默认分组，原文留空
    if (!mats.length) {
      const s1 = questions.filter((q) => q.no <= 5);
      s1.forEach((q) => mats.push(mkMaterial([q], '')));
      const s2 = questions.filter((q) => q.no > 5);
      if (s2.length) {
        let p = 0;
        const sizes = s2.length === 15 ? [2, 2, 3, 4, 4] : [Math.ceil(s2.length / 5)];
        if (sizes.length === 1) {
          const per = sizes[0];
          for (let i = 0; i < s2.length; i += per) mats.push(mkMaterial(s2.slice(i, i + per), ''));
        } else {
          sizes.forEach((size) => {
            const g = s2.slice(p, p + size);
            p += size;
            if (g.length) mats.push(mkMaterial(g, ''));
          });
          if (p < s2.length) mats[mats.length - 1].questions = mats[mats.length - 1].questions.concat(s2.slice(p));
        }
      }
      if (!scriptText && mode === 'none') warnings.push('没有找到听力原文：只能先用"上传音频"的方式练习，或在预览的 JSON 里手动补原文。');
    }

    mats.sort((a, b) => a.questions[0].no - b.questions[0].no);
    const sections = splitIntoSections(mats);

    const title = guessTitle(text, o.title) || '导入的听力材料';
    const year = guessYear(text, o.year);
    const set = {
      id: (o.id && String(o.id).replace(/[^A-Za-z0-9\-_]/g, '')) || makeId(title),
      title,
      exam: o.exam || '',
      year: year || '',
      source: o.source || '',
      durationSec: 1200,
      scorePerQuestion: 1.5,
      sections
    };

    // 统计与提示
    let qcount = 0;
    sections.forEach((s) => s.materials.forEach((m) => (qcount += m.questions.length)));
    const withScript = sections.reduce((a, s) => a + s.materials.filter((m) => m.transcript && m.transcript.length > 20).length, 0);
    const materialCount = sections.reduce((a, s) => a + s.materials.length, 0);
    if (qcount < total) warnings.push('有 ' + (total - qcount) + ' 道题没有归入任何一段材料，请核对预览。');
    if (!useSec1 && sections.length > 1) warnings.push('这套只有 ' + total + ' 题，已按题号自动分节。');

    return {
      ok: true,
      set,
      warnings,
      stats: { questions: qcount, materials: materialCount, withScript, answers: questions.filter((q) => q.answer).length, mode }
    };
  }

  const TEMPLATE = `# 标题: 2026届高三英语听力强化训练（三）
# 年份: 2026
# 来源: 听力书 P42

第一节
Text 1
W: Good morning. Can I help you?
M: Yes, I'd like to return this jacket.
W: May I ask why?
M: It's a bit small for me.

1. What does the man want to do?
A. Buy a jacket.
B. Return a jacket.
C. Try on a jacket.
答案: B

Text 2
M: How long does it take to get to the airport?
W: About half an hour by taxi, but the subway is quicker.
M: Then I'll take the subway.

2. How will the man go to the airport?
A. By taxi.
B. By bus.
C. By subway.
答案: C

第二节
Text 6
W: Hi, Peter. Are you going to the music festival this weekend?
M: I'd love to, but I have to finish my report by Monday.
W: That's a pity. The festival has been held every year since 2010.
M: Really? How many bands are playing this time?
W: About twenty, from home and abroad.
M: Well, I'll try to finish my report on Friday.

6. What is Peter busy with?
A. A music festival.
B. A report.
C. A concert.
答案: B

7. How many bands will play at the festival?
A. About ten.
B. About twenty.
C. About thirty.
答案: B`;

  return { parse, parseAnswers, normalize, TEMPLATE, guessTitle, guessYear, splitBlocks, stripQuestionLines };
})();

window.Parser = Parser;
