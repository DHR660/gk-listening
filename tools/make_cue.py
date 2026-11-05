#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成考试提示音（每段录音前的"叮—咚"铃声），输出 data/audio/_cue.wav。

真实高考听力录音在每段材料前都有一声提示铃，本脚本用正弦叠加 + 指数衰减合成一个
类似门铃/钟声的"叮咚"两音，避免版权问题，也方便随时调整。

    py tools/make_cue.py
"""
import math
import os
import struct
import wave

SR = 44100

# (频率, 起止时间, 衰减指数, 振幅, 谐波)
BELLS = [
    # 第一声"叮"
    dict(freq=1046.5, start=0.00, dur=0.75, decay=9.0, amp=0.55),
    # 第二声"咚"（低五度）
    dict(freq=784.0, start=0.42, dur=1.10, decay=7.0, amp=0.50),
]
HARMONICS = [(1.0, 1.00), (2.0, 0.32), (3.0, 0.14), (4.2, 0.06), (5.4, 0.03)]
TOTAL = 1.55


def bell_samples(freq, dur, decay, amp):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-decay * t)
        attack = min(1.0, t / 0.004)
        s = 0.0
        for mult, w in HARMONICS:
            s += w * math.sin(2 * math.pi * freq * mult * t) * math.exp(-decay * mult ** 0.6 * t)
        out.append(amp * env * attack * s)
    return out


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, 'data', 'audio', '_cue.wav')
    n = int(SR * TOTAL)
    buf = [0.0] * n
    for b in BELLS:
        samples = bell_samples(b['freq'], b['dur'], b['decay'], b['amp'])
        off = int(b['start'] * SR)
        for i, v in enumerate(samples):
            if off + i < n:
                buf[off + i] += v
    peak = max(1e-6, max(abs(v) for v in buf))
    scale = 0.85 / peak
    frames = b''.join(struct.pack('<h', int(max(-1.0, min(1.0, v * scale)) * 32767)) for v in buf)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with wave.open(out, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)
    print('%s  %.2fs  %.0fKB' % (out, TOTAL, os.path.getsize(out) / 1024))


if __name__ == '__main__':
    main()
