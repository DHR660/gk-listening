#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成高考英语听力"试音"音频：

  data/audio/_test_classic.mp3  经典版（2025 及以前）：九磅十五便士例题
  data/audio/_test_2026.mp3     2026 改革版：取消例题，只有中文提示 + 英文试音句

    py tools/make_test_audio.py
"""
import asyncio
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import tts  # noqa: E402

CLASSIC = [
    ["narrator", "现在开始试音。请调整耳机音量，确保能清楚地听到声音。"],
    ["male", "Excuse me. Can you tell me how much the shirt is?"],
    ["female", "Yes, it's nine fifteen."],
    ["narrator", "你将有五秒钟的时间将正确答案标在试卷上。衬衫的价格为九磅十五便士，所以你选择C项，并将其标在试卷上。"],
    ["narrator", "听力考试试音结束。"],
]

NEW_2026 = [
    ["narrator", "英语听力考试试音。请调整耳机音量，确保能清楚地听到声音。"],
    ["female", "Good morning, everyone. This is a sound test for the English listening examination. "
               "Please make sure that you can hear the voice clearly and comfortably. "
               "If the sound is too loud, please turn the volume down a little."],
    ["male", "The recording will be played only once, so listen carefully. "
             "Take a deep breath, and get ready for the examination."],
    ["narrator", "试音结束。请注意，从试音结束到开始播放，你有五秒钟的时间阅读第一小题的有关内容。"],
]


async def build(segments, out):
    await tts.edge_synth_segments(segments, out, "+0%", "+0Hz", 0.45)


async def main():
    out_dir = os.path.join(ROOT, "data", "audio")
    os.makedirs(out_dir, exist_ok=True)
    tasks = [
        (CLASSIC, os.path.join(out_dir, "_test_classic.mp3")),
        (NEW_2026, os.path.join(out_dir, "_test_2026.mp3")),
    ]
    for segs, path in tasks:
        await build(segs, path)
        print("%s  %.1fs  %.0fKB" % (path, tts.audio_duration(path) or 0, os.path.getsize(path) / 1024))


if __name__ == "__main__":
    asyncio.run(main())
