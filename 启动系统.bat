@echo off
chcp 936 >nul
title 高考英语听力 · 上机仿真练习系统
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 未检测到 Node.js。
  echo   请先安装 Node.js 18 或更高版本：https://nodejs.org/zh-cn
  echo   安装完成后重新双击本文件即可。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动本机服务，浏览器会自动打开……
echo   使用完毕后，直接关闭本窗口即可停止服务。
echo.

start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8765/"

node server.js

echo.
echo   服务已停止。按任意键关闭窗口。
pause >nul