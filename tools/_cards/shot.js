/* 把 cards.html 的 9 张卡片逐张截成 1080×1080 PNG（带重试写入） */
'use strict';
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const HERE = __dirname;
const OUT = path.join(HERE, '..', '..', 'qq空间九宫格');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writePng(file, base64) {
  for (let i = 0; i < 6; i++) {
    try {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
      }
      fs.writeFileSync(file, Buffer.from(base64, 'base64'));
      return true;
    } catch (e) {
      console.log('  重试写入', path.basename(file), e.code || e.message);
      sleep(400);
      // 同步等待，避免事件循环
      const until = Date.now() + 400;
      while (Date.now() < until) { /* busy wait */ }
    }
  }
  return false;
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files', '--force-device-scale-factor=1']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 1 });
  const url = 'file:///' + path.join(HERE, 'cards.html').replace(/\\/g, '/');
  await p.goto(url, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await sleep(800);

  const cards = await p.$$('.card');
  console.log('cards:', cards.length);
  for (let i = 0; i < cards.length; i++) {
    const name = path.join(OUT, String(i + 1).padStart(2, '0') + '.png');
    const b64 = await cards[i].screenshot({ encoding: 'base64' });
    const ok = writePng(name, b64);
    console.log((ok ? 'OK  ' : 'FAIL') + ' ' + path.basename(name) + '  ' + Math.round(b64.length * 0.75 / 1024) + 'KB');
  }

  // 九宫格预览
  await p.setViewport({ width: 3400, height: 3400 });
  await p.addStyleTag({ content: 'body{display:grid;grid-template-columns:repeat(3,1080px);gap:20px;background:#111}' });
  await sleep(600);
  const b64 = await p.screenshot({ encoding: 'base64', fullPage: true, type: 'jpeg', quality: 90 });
  writePng(path.join(OUT, '预览九宫格.jpg'), b64);
  await b.close();
})();
