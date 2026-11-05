@echo off
chcp 936 >nul
title 高考英语听力 · 上机仿真练习系统
cd /d "%~dp0"

set "NODE_EXE="
if exist "runtime\node.exe" set "NODE_EXE=runtime\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if not defined NODE_EXE (
  echo.
  echo   [错误] 未检测到 Node.js。
  echo   1^) 到 https://nodejs.org/zh-cn 下载 LTS 版安装，一路“下一步”，
  echo      安装时保持勾选 Add to PATH；
  echo   2^) 装完重新双击本文件即可。
  echo.
  echo   如果你拿到的是便携版，请把 node.exe 放到本文件夹的 runtime\ 目录下。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动本机服务（%NODE_EXE%），浏览器会自动打开……
echo   使用完毕后，直接关闭本窗口即可停止服务。
echo.

start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8765/"

"%NODE_EXE%" server.js

echo.
echo   服务已停止。按任意键关闭窗口。
pause >nul