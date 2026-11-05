#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 使用手册.md 转成单文件 HTML（图片内嵌 base64，双击即可看，不用联网）。

    py tools/md2html.py
输出：使用手册.html
"""
import base64
import html
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, '使用手册.md')
OUT = os.path.join(ROOT, '使用手册.html')


def esc(t):
    return html.escape(t, quote=False)


def inline(text):
    t = esc(text)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<a href="\2" target="_blank">\1</a>', t)
    return t


def img_data_uri(path):
    p = os.path.join(ROOT, path.replace('/', os.sep))
    if not os.path.exists(p):
        return None
    with open(p, 'rb') as f:
        data = f.read()
    ext = os.path.splitext(p)[1].lower().lstrip('.')
    mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'gif': 'image/gif', 'webp': 'image/webp'}.get(ext, 'image/png')
    return 'data:%s;base64,%s' % (mime, base64.b64encode(data).decode('ascii'))


def parse(md):
    lines = md.replace('\r\n', '\n').split('\n')
    blocks = []
    i, n = 0, len(lines)
    while i < n:
        s = lines[i].strip()
        if not s:
            i += 1
            continue
        if s.startswith('```'):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith('```'):
                buf.append(lines[i])
                i += 1
            i += 1
            blocks.append(('code', '\n'.join(buf)))
            continue
        m = re.match(r'^!\[(.*?)\]\((.+?)\)\s*$', s)
        if m:
            blocks.append(('img', (m.group(1), m.group(2))))
            i += 1
            continue
        m = re.match(r'^(#{1,4})\s+(.*)$', s)
        if m:
            blocks.append(('h', (len(m.group(1)), m.group(2).strip())))
            i += 1
            continue
        if re.match(r'^(-{3,}|\*{3,})$', s):
            blocks.append(('hr', None))
            i += 1
            continue
        if s.startswith('|') and i + 1 < n and re.match(r'^\|[\s:|-]+\|$', lines[i + 1].strip()):
            header = [c.strip() for c in s.strip('|').split('|')]
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            blocks.append(('table', (header, rows)))
            continue
        if s.startswith('>'):
            buf = []
            while i < n and lines[i].strip().startswith('>'):
                buf.append(lines[i].strip().lstrip('>').strip())
                i += 1
            blocks.append(('quote', '\n'.join(buf)))
            continue
        if re.match(r'^[-*]\s+', s):
            items = []
            while i < n and re.match(r'^\s*[-*]\s+', lines[i]):
                items.append(re.sub(r'^\s*[-*]\s+', '', lines[i].strip()))
                i += 1
            blocks.append(('ul', items))
            continue
        if re.match(r'^\d+\.\s+', s):
            items = []
            while i < n and re.match(r'^\s*\d+\.\s+', lines[i]):
                items.append(re.sub(r'^\s*\d+\.\s+', '', lines[i].strip()))
                i += 1
            blocks.append(('ol', items))
            continue
        buf = []
        while i < n:
            cur = lines[i].strip()
            if not cur or cur.startswith(('```', '|', '>', '#')) \
               or re.match(r'^!\[.*?\]\(.+?\)$', cur) \
               or re.match(r'^[-*]\s+', cur) or re.match(r'^\d+\.\s+', cur) \
               or re.match(r'^(-{3,}|\*{3,})$', cur):
                break
            buf.append(cur)
            i += 1
        if buf:
            blocks.append(('p', ' '.join(buf)))
    return blocks


CSS = """
:root{--ink:#122033;--muted:#5b6b82;--line:#e3e9f2;--brand:#1e5eff;--bg:#f5f7fb}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.8 "Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding:34px 32px 70px;background:#fff;box-shadow:0 0 0 1px var(--line),0 30px 60px -44px rgba(18,32,51,.4)}
.cover{position:relative;overflow:hidden;border-radius:18px;padding:38px 34px 30px;color:#fff;background:radial-gradient(900px 260px at 10% -30%,#2f6bff 0,transparent 60%),linear-gradient(135deg,#0b1729,#16233a 60%,#1b2f52);box-shadow:0 22px 48px -30px rgba(11,23,41,.8)}
.cover h1{font-size:30px;line-height:1.4;margin:0 0 14px;letter-spacing:.5px}
.cover p{margin:6px 0;color:#c3d3ec;font-size:14.5px;line-height:1.8}
.cover .tag{display:inline-block;margin-top:16px;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);font-size:12.5px;color:#dbe7f8;letter-spacing:.4px}
.toc{margin:24px 0 8px;padding:18px 22px;border:1px solid var(--line);border-radius:14px;background:#f8faff}
.toc h4{margin:0 0 10px;font-size:13px;color:var(--muted);letter-spacing:1.5px}
.toc ul{margin:0;padding:0;list-style:none;columns:2;column-gap:34px}
.toc a{color:#20344f;text-decoration:none;font-size:14.5px}
.toc a:hover{color:var(--brand)}
h2{margin:44px 0 14px;padding-bottom:10px;border-bottom:2px solid var(--line);font-size:23px;letter-spacing:.3px}
h3{margin:28px 0 10px;font-size:18px;color:#16283f}
h4{margin:22px 0 8px;font-size:16px}
p{margin:12px 0}
ul,ol{margin:10px 0;padding-left:24px}
li{margin:6px 0}
strong{color:#0b1a30}
code{padding:2px 6px;border-radius:6px;background:#eef3fb;color:#1b3a6b;font-size:.92em;font-family:ui-monospace,Consolas,monospace}
pre{margin:14px 0;padding:16px 18px;border-radius:12px;background:#0f1c2f;color:#d6e3f8;overflow:auto;font-size:13.5px;line-height:1.7}
pre code{background:none;color:inherit;padding:0}
figure{margin:22px 0 26px;text-align:center}
figure img{max-width:100%;border-radius:14px;border:1px solid var(--line);box-shadow:0 20px 42px -30px rgba(18,32,51,.55)}
figcaption{margin-top:9px;color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:15px}
th{background:#f3f7ff;text-align:left;font-size:13px;letter-spacing:.4px;color:#31465f}
th,td{padding:10px 13px;border:1px solid var(--line);vertical-align:top}
tr:nth-child(even) td{background:#fbfcff}
blockquote{margin:18px 0;padding:12px 18px;border-left:4px solid var(--brand);background:#f4f8ff;border-radius:0 10px 10px 0;color:#2b3f59}
blockquote p{margin:4px 0}
hr{border:0;height:1px;background:var(--line);margin:34px 0}
a{color:var(--brand)}
.foot{margin-top:46px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px;text-align:center}
@media print{body{background:#fff}.wrap{box-shadow:none;max-width:none;padding:0}h2{page-break-after:avoid}figure{page-break-inside:avoid}}
"""


def build(blocks):
    h2s = [(idx, b[1][1]) for idx, b in enumerate(blocks) if b[0] == 'h' and b[1][0] == 2]
    toc = ''
    if len(h2s) > 2:
        toc = '<div class="toc"><h4>目录</h4><ul class="toclist">' + ''.join(
            '<li><a href="#h%d">%s</a></li>' % (idx, inline(t)) for idx, t in h2s) + '</ol></div>'

    out = []
    i = 0
    while i < len(blocks):
        kind, payload = blocks[i]
        if kind == 'h':
            level, text = payload
            if level == 1:
                # 封面：标题 + 紧随其后的引用作为副标题
                sub = ''
                if i + 1 < len(blocks) and blocks[i + 1][0] == 'quote':
                    sub = ''.join('<p>%s</p>' % inline(l) for l in blocks[i + 1][1].split('\n'))
                    i += 1
                out.append('<div class="cover"><h1>%s</h1>%s<div class="tag">本地运行 · 37 套题库 · 2026 机考题型</div></div>' % (inline(text), sub))
                out.append(toc)
            else:
                anchor = ' id="h%d"' % i if level == 2 else ''
                out.append('<h%d%s>%s</h%d>' % (level, anchor, inline(text), level))
        elif kind == 'p':
            out.append('<p>%s</p>' % inline(payload))
        elif kind == 'img':
            alt, src = payload
            data = img_data_uri(src)
            if data:
                out.append('<figure><img src="%s" alt="%s"><figcaption>%s</figcaption></figure>' % (data, esc(alt), esc(alt)))
            else:
                out.append('<figure><div style="padding:28px;border:1px dashed #ccc;color:#999">图片缺失：%s</div><figcaption>%s</figcaption></figure>' % (esc(src), esc(alt)))
        elif kind == 'ul':
            out.append('<ul>' + ''.join('<li>%s</li>' % inline(x) for x in payload) + '</ul>')
        elif kind == 'ol':
            out.append('<ol>' + ''.join('<li>%s</li>' % inline(x) for x in payload) + '</ol>')
        elif kind == 'table':
            header, rows = payload
            out.append('<table><thead><tr>' + ''.join('<th>%s</th>' % inline(h) for h in header) +
                       '</tr></thead><tbody>' + ''.join('<tr>' + ''.join('<td>%s</td>' % inline(c) for c in r) + '</tr>' for r in rows) +
                       '</tbody></table>')
        elif kind == 'quote':
            out.append('<blockquote>' + ''.join('<p>%s</p>' % inline(l) for l in payload.split('\n')) + '</blockquote>')
        elif kind == 'code':
            out.append('<pre><code>%s</code></pre>' % esc(payload))
        elif kind == 'hr':
            out.append('<hr>')
        i += 1
    return '\n'.join(out)


def main():
    with open(MD, 'r', encoding='utf-8') as f:
        md = f.read()
    body = build(parse(md))
    doc = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>高考英语听力机考仿真练习系统 · 使用手册</title>
<style>%s</style>
</head><body><div class="wrap">
%s
<div class="foot">高考英语听力机考仿真练习系统 · 使用手册　|　本文件可离线打开，图片已内嵌</div>
</div></body></html>""" % (CSS, body)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(doc)
    print('%s  %.0fKB' % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
