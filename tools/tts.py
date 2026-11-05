#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
听力音频合成脚本（被 server.js 调用，也可单独使用）

  py tools/tts.py --engine edge --text-file t.txt --out out.mp3 --kind material
  py tools/tts.py --engine sapi --text-file t.txt --out out.wav --kind prompt

特点：
  * 按说话人标记（M:/W:/Man:/Woman:/Narrator: 等）自动分角色配音，男女声交替；
  * 多段 MP3 直接拼接（去掉 ID3 头，并自动插入与码流同格式的静音帧）；
  * 无网络时可用 Windows 本地语音（SAPI）合成 WAV；
  * 标准输出最后一行打印 JSON 结果，供前端解析。
"""
import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

EDGE_VOICES = {
    "male": "en-US-GuyNeural",
    "female": "en-US-JennyNeural",
    "narrator": "zh-CN-XiaoxiaoNeural",
    "en_narrator": "en-US-AriaNeural",
}

SAPI_VOICES = {
    "male": "Microsoft David Desktop",
    "female": "Microsoft Zira Desktop",
    "narrator": "Microsoft Huihui Desktop",
}

SPEAKER_M = {"m", "man", "male", "mr", "mr.", "boy", "father", "dad", "husband", "son", "brother", "jim", "tom", "jack"}
SPEAKER_F = {"w", "woman", "female", "ms", "ms.", "mrs", "mrs.", "girl", "mother", "mom", "mum", "wife", "daughter", "sister", "lily", "mary", "anna", "kate"}
SPEAKER_N = {"narrator", "n", "announcer", "voice", "teacher", "host", "speaker"}

LINE_RE = re.compile(r"^\s*([A-Za-z][A-Za-z\.\s]{0,16}?)\s*[:：]\s*(.*)$")

CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def clean_text(s: str) -> str:
    s = s.replace("\u3000", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"[\r\n]+", " ", s)
    return s.strip()


def split_turns(text: str):
    """把听力原文拆成 [(gender, text), ...]"""
    lines = [l for l in text.replace("\r\n", "\n").split("\n")]
    turns = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        m = LINE_RE.match(line)
        if m:
            who = m.group(1).strip().lower()
            body = m.group(2).strip()
            if who in SPEAKER_M:
                g = "male"
            elif who in SPEAKER_F:
                g = "female"
            elif who in SPEAKER_N:
                g = "female"
            else:
                g = None
            if g and body:
                turns.append([g, body])
                continue
            if g and not body:
                continue
        if turns:
            turns[-1][1] += " " + line
        else:
            turns.append([None, line])

    # 未标注性别的行按男女交替
    prev = "male"
    for t in turns:
        if t[0] is None:
            t[0] = "female" if prev == "male" else "male"
        prev = t[0]

    # 合并同一说话人连续行
    merged = []
    for g, body in turns:
        body = clean_text(body)
        if not body:
            continue
        if merged and merged[-1][0] == g:
            merged[-1][1] += " " + body
        else:
            merged.append([g, body])
    return merged


def parse_rate(v: str) -> str:
    v = str(v or "0").strip()
    if v.endswith("%"):
        v = v[:-1]
    try:
        n = float(v)
    except ValueError:
        n = 0.0
    n = max(-40.0, min(80.0, n))
    return "%+.0f%%" % n


def parse_pitch(v: str) -> str:
    v = str(v or "0").strip().lower().replace("hz", "")
    try:
        n = float(v)
    except ValueError:
        n = 0.0
    n = max(-40.0, min(40.0, n))
    return "%+.0fHz" % n


# --------------------------------------------------------------------- MP3

def strip_id3(data: bytes) -> bytes:
    if data[:3] == b"ID3":
        size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
        data = data[10 + size:]
    # 去掉尾部 ID3v1
    if len(data) > 128 and data[-128:-125] == b"TAG":
        data = data[:-128]
    return data


MPEG_BITRATES = {
    # (version_is_1, layer) -> [bitrate kbps indexed 1..14]
    (1, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (1, 2): [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    (0, 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    (0, 2): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}

SR_TABLE = {
    1: [44100, 48000, 32000],      # MPEG1
    0: [22050, 24000, 16000],      # MPEG2
    2: [11025, 12000, 8000],       # MPEG2.5
}


def probe_frame(data: bytes):
    """返回 (header4bytes, frame_len, duration_sec, header_offset)"""
    i = 0
    n = len(data)
    while i + 4 <= n:
        if data[i] == 0xFF and (data[i + 1] & 0xE0) == 0xE0:
            b1, b2, b3 = data[i + 1], data[i + 2], data[i + 3]
            version_bits = (b1 >> 3) & 0x03   # 3=MPEG1, 2=MPEG2, 0=MPEG2.5
            layer_bits = (b1 >> 1) & 0x03     # 1=Layer3
            if layer_bits != 1:
                i += 1
                continue
            if version_bits == 3:
                ver = 1
            elif version_bits == 2:
                ver = 0
            elif version_bits == 0:
                ver = 2
            else:
                i += 1
                continue
            br_idx = (b2 >> 4) & 0x0F
            sr_idx = (b2 >> 2) & 0x03
            if br_idx in (0, 15) or sr_idx == 3:
                i += 1
                continue
            padding = (b2 >> 1) & 0x01
            bitrate = MPEG_BITRATES[(1 if ver == 1 else 0, 3)][br_idx] * 1000
            samplerate = SR_TABLE[ver][sr_idx]
            if ver == 1:
                frame_len = int(144 * bitrate / samplerate) + padding
                spf = 1152
            else:
                frame_len = int(72 * bitrate / samplerate) + padding
                spf = 576
            dur = spf / float(samplerate)
            return data[i:i + 4], frame_len, dur, i
        i += 1
    return None


def silence_frames(header: bytes, frame_len: int, dur: float, seconds: float) -> bytes:
    count = max(0, int(round(seconds / max(dur, 0.001))))
    frame = bytearray(frame_len)
    header_len = min(len(header), frame_len)
    frame[:header_len] = header[:header_len]
    return bytes(frame) * count


# --------------------------------------------------------------------- edge

async def edge_synth_segments(segments, out_path, rate, pitch, gap):
    import edge_tts

    tmp_dir = tempfile.mkdtemp(prefix="tts_")
    parts = []
    try:
        for idx, (gender, text) in enumerate(segments):
            voice = EDGE_VOICES.get(gender, EDGE_VOICES["female"])
            mp3 = os.path.join(tmp_dir, "p%03d.mp3" % idx)
            last_err = None
            for attempt in range(3):
                try:
                    com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                    await com.save(mp3)
                    if os.path.getsize(mp3) > 200:
                        last_err = None
                        break
                    last_err = "empty audio"
                except Exception as e:  # noqa: BLE001
                    last_err = str(e)
                    await asyncio.sleep(0.6)
            if last_err:
                raise RuntimeError("合成失败（第 %d 段）：%s" % (idx + 1, last_err))
            parts.append(open(mp3, "rb").read())

        if not parts:
            raise RuntimeError("没有可合成的文本")

        first = strip_id3(parts[0])
        probe = probe_frame(first)
        out = bytearray(first)
        for p in parts[1:]:
            data = strip_id3(p)
            if probe:
                header, frame_len, dur, _ = probe
                out += silence_frames(header, frame_len, dur, gap)
            out += data
        with open(out_path, "wb") as f:
            f.write(bytes(out))
    finally:
        for f in os.listdir(tmp_dir):
            try:
                os.remove(os.path.join(tmp_dir, f))
            except OSError:
                pass
        try:
            os.rmdir(tmp_dir)
        except OSError:
            pass


# --------------------------------------------------------------------- sapi

SAPI_PS = r"""
Add-Type -AssemblyName System.Speech
$sp = New-Object System.Speech.Synthesis.SpeechSynthesizer
$sp.SelectVoice('{voice}')
$sp.Rate = {rate}
$sp.SetOutputToWaveFile('{out}')
$sp.Speak([Console]::In.ReadToEnd())
$sp.Dispose()
"""


def sapi_synth_segments(segments, out_path, rate, gap):
    tmp_dir = tempfile.mkdtemp(prefix="tts_")
    wavs = []
    try:
        rate_int = max(-10, min(10, int(round(float(rate.strip('%+') or 0) / 10.0))))
        for idx, (gender, text) in enumerate(segments):
            voice = SAPI_VOICES.get(gender, SAPI_VOICES["female"])
            wav = os.path.join(tmp_dir, "p%03d.wav" % idx)
            ps = SAPI_PS.format(voice=voice, rate=rate_int, out=wav.replace("'", "''"))
            env = dict(os.environ)
            p = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                input=text.encode("utf-8"),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
            )
            if p.returncode != 0 or not os.path.exists(wav):
                raise RuntimeError("SAPI 合成失败：%s" % (p.stderr.decode("utf-8", "ignore")[-400:]))
            wavs.append(wav)

        params = None
        with wave.open(out_path, "wb") as outw:
            for w in wavs:
                with wave.open(w, "rb") as r:
                    if params is None:
                        params = r.getparams()
                        outw.setparams(params)
                    frames = r.readframes(r.getnframes())
                    outw.writeframes(frames)
                    if params:
                        n_gap = int(params.framerate * gap)
                        outw.writeframes(b"\x00" * (n_gap * params.sampwidth * params.nchannels))
    finally:
        for f in os.listdir(tmp_dir):
            try:
                os.remove(os.path.join(tmp_dir, f))
            except OSError:
                pass
        try:
            os.rmdir(tmp_dir)
        except OSError:
            pass


def audio_duration(path: str):
    try:
        if path.lower().endswith(".wav"):
            with wave.open(path, "rb") as r:
                return r.getnframes() / float(r.getframerate())
        data = open(path, "rb").read()
        data = strip_id3(data)
        probe = probe_frame(data)
        if not probe:
            return None
        header, frame_len, dur, off = probe
        return round((len(data) - off) / float(frame_len) * dur, 2)
    except Exception:  # noqa: BLE001
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="edge", choices=["edge", "sapi"])
    ap.add_argument("--text-file", default="")
    ap.add_argument("--text", default="")
    ap.add_argument("--out", required=True)
    ap.add_argument("--kind", default="material", choices=["material", "prompt"])
    ap.add_argument("--male", default=EDGE_VOICES["male"])
    ap.add_argument("--female", default=EDGE_VOICES["female"])
    ap.add_argument("--narrator", default=EDGE_VOICES["narrator"])
    ap.add_argument("--rate", default="0")
    ap.add_argument("--pitch", default="0")
    ap.add_argument("--gap", default="0.35")
    args = ap.parse_args()

    if args.male:
        EDGE_VOICES["male"] = args.male
    if args.female:
        EDGE_VOICES["female"] = args.female
    if args.narrator:
        EDGE_VOICES["narrator"] = args.narrator

    text = args.text
    if args.text_file and os.path.exists(args.text_file):
        with open(args.text_file, "r", encoding="utf-8-sig") as f:
            text = f.read()
    text = (text or "").lstrip("\ufeff").strip()
    if not text:
        print(json.dumps({"ok": False, "error": "文本为空"}, ensure_ascii=False))
        return 1

    rate = parse_rate(args.rate)
    pitch = parse_pitch(args.pitch)
    try:
        gap = max(0.0, min(2.0, float(args.gap)))
    except ValueError:
        gap = 0.35

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)

    if args.kind == "prompt" or CJK_RE.search(text):
        segments = [["narrator", clean_text(text)]]
    else:
        segments = split_turns(text)
        if not segments:
            segments = [["female", clean_text(text)]]

    try:
        if args.engine == "sapi":
            sapi_synth_segments(segments, args.out, rate, gap)
        else:
            asyncio.run(edge_synth_segments(segments, args.out, rate, pitch, gap))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        return 1

    print(json.dumps({
        "ok": True,
        "file": args.out,
        "engine": args.engine,
        "segments": len(segments),
        "chars": len(text),
        "duration": audio_duration(args.out),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
