#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
批量给题库里的每一段材料生成音频（材料音 + 中文指令音），支持断点续传。

    py tools/build_audio.py                  # 全部试卷，缺什么补什么
    py tools/build_audio.py gk2024-xkb1      # 只做指定试卷（可多个）
    py tools/build_audio.py --prompt-only    # 只补中文指令音
    py tools/build_audio.py --force          # 已有音频也重新生成
    py tools/build_audio.py --jobs=6         # 并发数（默认 5）

生成的音频放在 data/audio/<试卷id>/<材料id>.mp3 与 <材料id>.prompt.mp3，
网页端会自动识别（无需改 JSON）。
"""
import asyncio
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import tts  # noqa: E402


def prompt_text(sec_name, mat):
    qs = mat.get("questions") or []
    if not qs:
        return "听下面一段材料。"
    frm = qs[0].get("no", 1)
    to = qs[-1].get("no", frm)
    if frm == to:
        return "听下面一段对话，回答第%d小题。" % frm
    return "听下面一段对话或独白，回答第%d至第%d小题。" % (frm, to)


async def build_one(task, sem, rate, force, prompt_only, stats):
    sid, mid, text, pr_text, out_dir = task
    mat_file = os.path.join(out_dir, mid + ".mp3")
    pr_file = os.path.join(out_dir, mid + ".prompt.mp3")
    async with sem:
        try:
            if not prompt_only and (force or not os.path.exists(mat_file) or os.path.getsize(mat_file) < 500):
                segs = tts.split_turns(text)
                if segs:
                    await tts.edge_synth_segments(segs, mat_file, tts.parse_rate(rate), "+0Hz", 0.35)
                    stats["ok"] += 1
                    print("[ok] %s/%s %.0fKB" % (sid, mid, os.path.getsize(mat_file) / 1024), flush=True)
            if force or not os.path.exists(pr_file) or os.path.getsize(pr_file) < 300:
                await tts.edge_synth_segments([["narrator", tts.clean_text(pr_text)]], pr_file,
                                              tts.parse_rate(rate), "+0Hz", 0.2)
        except Exception as e:  # noqa: BLE001
            stats["fail"] += 1
            print("[fail] %s/%s: %s" % (sid, mid, str(e)[:160]), flush=True)
        finally:
            stats["done"] += 1


async def main():
    args = [a for a in sys.argv[1:]]
    force = "--force" in args
    prompt_only = "--prompt-only" in args
    rate = "0"
    jobs = 5
    for a in list(args):
        if a.startswith("--rate="):
            rate = a.split("=", 1)[1]
        elif a.startswith("--jobs="):
            jobs = max(1, int(a.split("=", 1)[1]))
    only = [a for a in args if not a.startswith("--")]

    sets_dir = os.path.join(ROOT, "data", "sets")
    names = sorted(f for f in os.listdir(sets_dir) if f.endswith(".json"))
    if only:
        names = [f for f in names if f[:-5] in only]

    tasks = []
    for name in names:
        try:
            with open(os.path.join(sets_dir, name), "r", encoding="utf-8-sig") as f:
                s = json.load(f)
        except Exception as e:  # noqa: BLE001
            print("[skip] %s: %s" % (name, e), flush=True)
            continue
        sid = s.get("id") or name[:-5]
        out_dir = os.path.join(ROOT, "data", "audio", sid)
        os.makedirs(out_dir, exist_ok=True)
        for sec in s.get("sections", []):
            for mat in sec.get("materials", []):
                mid = mat.get("id")
                txt = (mat.get("transcript") or "").strip()
                if not mid:
                    continue
                tasks.append((sid, mid, txt, prompt_text(sec.get("name", ""), mat), out_dir))

    if prompt_only:
        tasks = [t for t in tasks if t[2]]
    print("共 %d 段材料，并发 %d …\n" % (len(tasks), jobs), flush=True)

    sem = asyncio.Semaphore(jobs)
    stats = {"done": 0, "ok": 0, "fail": 0}
    await asyncio.gather(*[build_one(t, sem, rate, force, prompt_only, stats) for t in tasks])
    print("\n完成 %d 段，新生成 %d 段，失败 %d 段" % (stats["done"], stats["ok"], stats["fail"]), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
