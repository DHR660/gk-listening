/**
 * 高考英语听力 · 上机仿真练习系统 —— 本地服务端（零依赖 Node.js）
 *
 *   node server.js            启动，默认 http://127.0.0.1:8765/
 *   PORT=9000 node server.js  指定端口
 *
 * 目录约定：
 *   web/            前端页面
 *   data/sets/      题库（每套一个 JSON）
 *   data/audio/<setId>/<materialId>.mp3   听力音频
 *   data/records.json                     练习记录
 *   tools/tts.py    语音合成脚本（edge-tts / Windows SAPI）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { spawn, spawnSync } = require('child_process');

const ROOT = __dirname;
const WEB_DIR = path.join(ROOT, 'web');
const DATA_DIR = path.join(ROOT, 'data');
const SETS_DIR = path.join(DATA_DIR, 'sets');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const TTS_SCRIPT = path.join(ROOT, 'tools', 'tts.py');
const PORT = Number(process.env.PORT || 8765);

for (const d of [WEB_DIR, DATA_DIR, SETS_DIR, AUDIO_DIR, path.join(DATA_DIR, 'raw')]) {
  fs.mkdirSync(d, { recursive: true });
}

/* ------------------------------------------------------------------ utils */

const ID_RE = /^[A-Za-z0-9_\-.]{1,80}$/;

function safeId(s) {
  return typeof s === 'string' && ID_RE.test(s) ? s : null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function mimeOf(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

function send(res, code, body, headers) {
  const h = Object.assign({ 'Cache-Control': 'no-store' }, headers || {});
  res.writeHead(code, h);
  res.end(body);
}

function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    const type = mimeOf(file);
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        let start = m[1] === '' ? null : Number(m[1]);
        let end = m[2] === '' ? null : Number(m[2]);
        if (start === null) {
          // suffix range: last N bytes
          const n = end === null ? 0 : end;
          start = Math.max(0, st.size - n);
          end = st.size - 1;
        } else {
          end = end === null ? st.size - 1 : Math.min(end, st.size - 1);
        }
        if (start > end || start >= st.size) {
          return send(res, 416, '', { 'Content-Range': `bytes */${st.size}` });
        }
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store'
        });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJSON(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

/* ---------------------------------------------------------------- runtime */

const PY = (() => {
  for (const c of ['py', 'python', 'python3']) {
    try {
      const r = spawnSync(c, ['-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8', timeout: 8000 });
      if (r.status === 0 && String(r.stdout).trim() === '3') return c;
    } catch (_) { /* next */ }
  }
  return null;
})();

let EDGE_TTS = false;
if (PY) {
  try {
    const r = spawnSync(PY, ['-c', 'import edge_tts,sys;sys.stdout.write("1")'], { encoding: 'utf8', timeout: 15000 });
    EDGE_TTS = r.status === 0 && String(r.stdout).trim() === '1';
  } catch (_) { EDGE_TTS = false; }
}

const STATUS = {
  server: 'ok',
  python: PY || null,
  edgeTts: EDGE_TTS,
  sapi: process.platform === 'win32',
  node: process.version,
  port: PORT
};

/* ------------------------------------------------------------- set storage */

function setPath(id) {
  return path.join(SETS_DIR, id + '.json');
}

async function listSets() {
  const out = [];
  let names = [];
  try { names = await fsp.readdir(SETS_DIR); } catch (_) { names = []; }
  for (const n of names.filter((x) => x.endsWith('.json'))) {
    try {
      const raw = await fsp.readFile(path.join(SETS_DIR, n), 'utf8');
      const s = JSON.parse(raw.replace(/^\uFEFF/, ''));
      if (!Number(s.total)) {
        s.total = (s.sections || []).reduce((a, sec) => a + (sec.materials || []).reduce((b, m) => b + (m.questions || []).length, 0), 0);
      }
      out.push(s);
    } catch (e) {
      console.warn('[warn] 题库文件解析失败：', n, e.message);
    }
  }
  out.sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.title).localeCompare(String(b.title)));
  return out;
}

function normalizeSet(s) {
  if (!s || typeof s !== 'object') throw new Error('题目数据为空');
  if (!Array.isArray(s.sections) || !s.sections.length) throw new Error('缺少 sections');
  let n = 0;
  for (const sec of s.sections) {
    if (!Array.isArray(sec.materials) || !sec.materials.length) throw new Error('某小节缺少 materials');
    const plays = Number(sec.plays);
    sec.plays = plays === 1 ? 1 : 2;
    for (const m of sec.materials) {
      m.questions = Array.isArray(m.questions) ? m.questions : [];
      for (const q of m.questions) {
        n += 1;
        q.no = Number(q.no) || n;
        const opts = q.options || {};
        q.options = {
          A: String(opts.A || ''),
          B: String(opts.B || ''),
          C: String(opts.C || ''),
          ...(opts.D ? { D: String(opts.D) } : {})
        };
        q.answer = String(q.answer || '').trim().toUpperCase().slice(0, 1);
        q.text = String(q.text || '');
      }
      m.transcript = String(m.transcript || '');
    }
  }
  s.title = String(s.title || '未命名试卷');
  s.durationSec = Number(s.durationSec) > 0 ? Number(s.durationSec) : 1200;
  s.scorePerQuestion = Number(s.scorePerQuestion) >= 0 ? Number(s.scorePerQuestion) : 1.5;
  s.total = n;
  s.updatedAt = Date.now();
  return s;
}

function audioDirOf(setId) {
  const dir = path.join(AUDIO_DIR, setId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function audioInfo(setId) {
  const dir = path.join(AUDIO_DIR, setId);
  const map = {};
  let files = [];
  try { files = await fsp.readdir(dir); } catch (_) { return map; }
  for (const f of files) {
    const base = f.replace(/\.(mp3|wav|m4a|ogg|aac|flac)$/i, '');
    if (!map[base]) map[base] = f;
  }
  return map;
}

/* ---------------------------------------------------------------- records */

async function loadRecords() {
  try {
    return JSON.parse((await fsp.readFile(RECORDS_FILE, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (_) {
    return [];
  }
}

async function saveRecords(list) {
  await fsp.writeFile(RECORDS_FILE, JSON.stringify(list.slice(0, 2000), null, 0), 'utf8');
}

/* ------------------------------------------------------------------- docx */

function readZipEntries(buf) {
  // 极简 ZIP 解析：只支持 stored / deflate
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 docx（ZIP）文件');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);
    let data = null;
    try {
      data = method === 0 ? raw : zlib.inflateRawSync(raw);
    } catch (_) {
      data = null;
    }
    if (data) entries.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function xmlToText(xml) {
  const withBreaks = xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<w:tc[^>]*>/g, '\t');
  const text = withBreaks.replace(/<[^>]+>/g, '');
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* -------------------------------------------------------------------- tts */

function runTTS(args, timeoutMs = 300000) {
  return new Promise((resolve) => {
    if (!PY) return resolve({ ok: false, error: '未检测到 Python 3，无法合成音频（可改用"上传音频"方式）' });
    const child = spawn(PY, [TTS_SCRIPT, ...args], { cwd: ROOT, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) { /* ignore */ }
      err += '\n[timeout] 合成超时';
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed = null;
      const lines = out.trim().split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        try { parsed = JSON.parse(lines[i]); break; } catch (_) { /* keep looking */ }
      }
      if (code === 0 && parsed && parsed.ok !== false) {
        resolve(Object.assign({ ok: true, log: out.slice(-2000) }, parsed || {}));
      } else {
        resolve({ ok: false, error: (parsed && parsed.error) || err.slice(-1200) || out.slice(-1200) || '合成失败', log: out.slice(-1500) });
      }
    });
  });
}

/* ------------------------------------------------------------------ router */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  try {
    /* ---------- api ---------- */
    if (pathname.startsWith('/api/')) {
      const seg = pathname.split('/').filter(Boolean); // ['api', ...]

      if (method === 'GET' && pathname === '/api/status') {
        return sendJSON(res, 200, STATUS);
      }

      if (pathname === '/api/sets' && method === 'GET') {
        const sets = await listSets();
        for (const s of sets) {
          const info = await audioInfo(s.id);
          let have = 0;
          const total = s.sections.reduce((a, x) => a + x.materials.length, 0);
          for (const sec of s.sections) {
            for (const m of sec.materials) {
              if (info[m.id]) { have += 1; m.audio = `/audio/${s.id}/${info[m.id]}`; m.hasAudio = true; }
              else if (m.audio && /^https?:/i.test(m.audio)) { have += 1; m.hasAudio = true; }
              else { m.hasAudio = false; }
              if (info[m.id + '.prompt']) m.promptAudio = `/audio/${s.id}/${info[m.id + '.prompt']}`;
            }
          }
          s.audioHave = have;
          s.audioTotal = total;
        }
        return sendJSON(res, 200, sets);
      }

      if (pathname === '/api/sets' && method === 'POST') {
        const body = await readJSON(req, 60 * 1024 * 1024);
        const set = normalizeSet(body);
        set.id = safeId(set.id) ? set.id : 'set' + Date.now();
        set.createdAt = set.createdAt || Date.now();
        await fsp.writeFile(setPath(set.id), JSON.stringify(set), 'utf8');
        return sendJSON(res, 200, { ok: true, id: set.id, total: set.total });
      }

      if (seg[1] === 'sets' && seg[2] && method === 'PUT') {
        const id = safeId(seg[2]);
        if (!id) return sendJSON(res, 400, { ok: false, error: '非法 id' });
        const body = await readJSON(req, 60 * 1024 * 1024);
        const set = normalizeSet(body);
        set.id = id;
        await fsp.writeFile(setPath(id), JSON.stringify(set), 'utf8');
        return sendJSON(res, 200, { ok: true, id, total: set.total });
      }

      if (seg[1] === 'sets' && seg[2] && method === 'DELETE') {
        const id = safeId(seg[2]);
        if (!id) return sendJSON(res, 400, { ok: false, error: '非法 id' });
        try { await fsp.unlink(setPath(id)); } catch (_) { /* ignore */ }
        try { await fsp.rm(path.join(AUDIO_DIR, id), { recursive: true, force: true }); } catch (_) { /* ignore */ }
        return sendJSON(res, 200, { ok: true });
      }

      // 上传音频：POST /api/upload/<setId>/<materialId>?ext=.mp3   原始二进制 body
      if (seg[1] === 'upload' && seg[2] && seg[3] && method === 'POST') {
        const setId = safeId(seg[2]);
        const materialId = safeId(seg[3]);
        if (!setId || !materialId) return sendJSON(res, 400, { ok: false, error: '非法参数' });
        let ext = (url.searchParams.get('ext') || '.mp3').toLowerCase();
        if (!/^\.(mp3|wav|m4a|ogg|aac|flac)$/.test(ext)) ext = '.mp3';
        const buf = await readBody(req, 200 * 1024 * 1024);
        if (!buf.length) return sendJSON(res, 400, { ok: false, error: '音频为空' });
        const dir = audioDirOf(setId);
        const info = await audioInfo(setId);
        if (info[materialId]) {
          try { await fsp.unlink(path.join(dir, info[materialId])); } catch (_) { /* ignore */ }
        }
        const file = materialId + ext;
        await fsp.writeFile(path.join(dir, file), buf);
        return sendJSON(res, 200, { ok: true, url: `/audio/${setId}/${file}`, bytes: buf.length });
      }

      if (seg[1] === 'audio' && seg[2] && method === 'DELETE') {
        const setId = safeId(seg[2]);
        const materialId = safeId(seg[3] || '');
        if (!setId) return sendJSON(res, 400, { ok: false, error: '非法参数' });
        const info = await audioInfo(setId);
        if (materialId && info[materialId]) {
          try { await fsp.unlink(path.join(AUDIO_DIR, setId, info[materialId])); } catch (_) { /* ignore */ }
        }
        return sendJSON(res, 200, { ok: true });
      }

      // 语音合成：POST /api/tts
      if (pathname === '/api/tts' && method === 'POST') {
        const b = await readJSON(req, 40 * 1024 * 1024);
        const setId = safeId(b.setId);
        const materialId = safeId(b.materialId);
        if (!setId || !materialId) return sendJSON(res, 400, { ok: false, error: '缺少 setId / materialId' });
        const text = String(b.text || '').trim();
        if (!text) return sendJSON(res, 400, { ok: false, error: '文本为空' });
        const engine = b.engine === 'sapi' ? 'sapi' : 'edge';
        if (engine === 'edge' && !EDGE_TTS) {
          return sendJSON(res, 400, { ok: false, error: 'edge-tts 未安装：py -m pip install edge-tts' });
        }
        const dir = audioDirOf(setId);
        const ext = engine === 'sapi' ? '.wav' : '.mp3';
        const outFile = path.join(dir, materialId + ext);
        const txtFile = path.join(dir, materialId + '.txt');
        await fsp.writeFile(txtFile, text, 'utf8');
        const args = [
          '--engine', engine,
          '--text-file', txtFile,
          '--out', outFile,
          '--text', text,
          '--kind', b.kind === 'prompt' ? 'prompt' : 'material',
          '--male', b.maleVoice || 'en-US-GuyNeural',
          '--female', b.femaleVoice || 'en-US-JennyNeural',
          '--narrator', b.narratorVoice || 'zh-CN-XiaoxiaoNeural',
          '--rate', String(b.rate || 0),
          '--pitch', String(b.pitch || 0),
          '--gap', String(b.gap == null ? 0.35 : b.gap)
        ];
        const r = await runTTS(args, engine === 'edge' ? 240000 : 120000);
        try { await fsp.unlink(txtFile); } catch (_) { /* ignore */ }
        if (!r.ok) return sendJSON(res, 500, { ok: false, error: r.error });
        const info = await audioInfo(setId);
        // 清掉同一 material 的旧扩展名文件
        for (const [k, f] of Object.entries(info)) {
          if (k === materialId && f !== path.basename(outFile)) {
            try { await fsp.unlink(path.join(dir, f)); } catch (_) { /* ignore */ }
          }
        }
        return sendJSON(res, 200, {
          ok: true,
          url: `/audio/${setId}/${path.basename(outFile)}`,
          engine,
          duration: r.duration || null,
          chars: r.chars || text.length
        });
      }

      if (pathname === '/api/records' && method === 'GET') {
        return sendJSON(res, 200, await loadRecords());
      }

      if (pathname === '/api/records' && method === 'POST') {
        const b = await readJSON(req, 4 * 1024 * 1024);
        const list = await loadRecords();
        b.id = b.id || 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        b.at = b.at || Date.now();
        list.unshift(b);
        await saveRecords(list);
        return sendJSON(res, 200, { ok: true, id: b.id });
      }

      if (pathname === '/api/records' && method === 'DELETE') {
        const b = await readJSON(req, 1024 * 1024);
        const list = await loadRecords();
        if (b.id) await saveRecords(list.filter((r) => r.id !== b.id));
        else await saveRecords([]);
        return sendJSON(res, 200, { ok: true });
      }

      // 导入 docx / txt：POST /api/extract  （原始二进制 + ?name=xxx.docx）
      if (pathname === '/api/extract' && method === 'POST') {
        const name = url.searchParams.get('name') || '';
        const buf = await readBody(req, 80 * 1024 * 1024);
        let text = '';
        if (/\.docx$/i.test(name) || buf.slice(0, 2).toString() === 'PK') {
          const entries = readZipEntries(buf);
          const xml = entries.get('word/document.xml');
          if (!xml) return sendJSON(res, 400, { ok: false, error: 'docx 中未找到正文' });
          text = xmlToText(xml.toString('utf8'));
        } else {
          text = buf.toString('utf8');
        }
        return sendJSON(res, 200, { ok: true, text });
      }

      return sendJSON(res, 404, { ok: false, error: 'API 不存在' });
    }

    /* ---------- static ---------- */
    if (method !== 'GET' && method !== 'HEAD') return send(res, 405, 'Method Not Allowed');

    let rel = pathname;
    if (rel === '/' || rel === '') rel = '/index.html';

    let base = WEB_DIR;
    if (rel.startsWith('/audio/')) { base = AUDIO_DIR; rel = rel.slice('/audio'.length); }
    else if (rel.startsWith('/data/')) { base = DATA_DIR; rel = rel.slice('/data'.length); }
    else if (rel.startsWith('/web/')) { base = WEB_DIR; rel = rel.slice('/web'.length); }

    const file = path.normalize(path.join(base, rel));
    if (!file.startsWith(base)) return send(res, 403, 'Forbidden');
    return serveFile(req, res, file);
  } catch (e) {
    console.error('[error]', e);
    return sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
  }
});

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const k of Object.keys(nets)) {
    for (const n of nets[k] || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddresses();
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║   高考英语听力 · 上机仿真练习系统                        ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('   本机访问： http://127.0.0.1:' + PORT + '/');
  for (const ip of lan) console.log('   局域网：   http://' + ip + ':' + PORT + '/   (同一 WiFi 的手机/平板可练)');
  console.log('   语音合成： ' + (EDGE_TTS ? 'edge-tts（在线神经语音）可用' : (PY ? 'edge-tts 未安装，可用 Windows 本地语音(SAPI)' : '未检测到 Python，请用"上传音频"方式')));
  console.log('   关闭本窗口即停止服务。');
  console.log('');
});
