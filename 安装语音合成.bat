@echo off
chcp 936 >nul
title 安装语音合成环境（edge-tts）
cd /d "%~dp0"

echo.
echo   本脚本用 pip 安装 edge-tts，用于把听力原文自动合成男女声对话。
echo   需要电脑上已安装 Python 3（安装时请勾选 Add Python to PATH）。
echo.

py -m pip --version >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未找到 Python，请先安装：https://www.python.org/downloads/
  echo.
  pause
  exit /b 1
)

py -m pip install --upgrade edge-tts

echo.
echo   安装完成。回到练习系统按 F5 刷新，即可在「题库管理 - 音频工作台」一键生成配音。
echo.
pause