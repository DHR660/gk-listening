# 推送到 GitHub（本地仓库已经提交好，只差远程 + push）
# 用法：
#   .\推送到GitHub.ps1 -RepoUrl https://github.com/<你的用户名>/gk-listening.git
#   .\推送到GitHub.ps1 -RepoUrl git@github.com:<你的用户名>/gk-listening.git
#   .\推送到GitHub.ps1 -UseGh          # 装了 GitHub CLI 且已 gh auth login 时，自动建仓库并推送
#
# 前置：在 GitHub 网页先新建一个空仓库（不要勾 README/.gitignore/License），或使用 -UseGh 自动创建。

param(
    [string]$RepoUrl = "",
    [switch]$UseGh,
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Find-Git {
    $cands = New-Object System.Collections.ArrayList
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { [void]$cands.Add($cmd.Source) }
    if ($env:ProgramFiles) { [void]$cands.Add((Join-Path $env:ProgramFiles 'Git\cmd\git.exe')) }
    $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($pf86) { [void]$cands.Add((Join-Path $pf86 'Git\cmd\git.exe')) }
    if ($env:LOCALAPPDATA) { [void]$cands.Add((Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe')) }
    # 本机已下载的便携版（可选）
    [void]$cands.Add('E:\文档\dkh\_tools\git\mingit\cmd\git.exe')
    foreach ($c in $cands) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

$git = Find-Git
if (-not $git) {
    Write-Host "没有找到 git。" -ForegroundColor Red
    Write-Host "先装一个（任选）："
    Write-Host "  winget install --id Git.Git -e"
    Write-Host "  或下载便携版 MinGit 解压后把路径传给本脚本的 -GitPath"
    exit 1
}
Write-Host "使用 git: $git" -ForegroundColor DarkGray

# 确保在这个仓库里
if (-not (Test-Path (Join-Path $PWD ".git"))) {
    Write-Host "当前目录不是 git 仓库：$PWD" -ForegroundColor Red
    exit 1
}

if ($UseGh) {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        Write-Host "没装 GitHub CLI，先运行： winget install --id GitHub.cli -e" -ForegroundColor Red
        exit 1
    }
    & gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "GitHub CLI 还没登录，先运行： gh auth login" -ForegroundColor Red
        exit 1
    }
    Write-Host "正在创建仓库并推送…" -ForegroundColor Cyan
    & gh repo create gk-listening --public --source=. --remote=origin --push `
        --description "高考英语听力机考仿真练习系统：37 套题库 + 全套音频，支持纸质听力书导入与 AI 配音"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "完成！打开 https://github.com/$( & gh api user -q .login )/gk-listening" -ForegroundColor Green
    }
    exit $LASTEXITCODE
}

if (-not $RepoUrl) {
    Write-Host "需要远程仓库地址，例如：" -ForegroundColor Yellow
    Write-Host "  .\推送到GitHub.ps1 -RepoUrl https://github.com/yourname/gk-listening.git"
    Write-Host "或者（已 gh auth login）："
    Write-Host "  .\推送到GitHub.ps1 -UseGh"
    exit 1
}

# 已有 origin 就改地址，没有就添加
$hasOrigin = (& $git remote) -contains "origin"
if ($hasOrigin) {
    & $git remote set-url origin $RepoUrl
} else {
    & $git remote add origin $RepoUrl
}
Write-Host "origin -> $RepoUrl" -ForegroundColor DarkGray

Write-Host "开始推送（首次约 95 MB，网慢可能要几分钟）…" -ForegroundColor Cyan
& $git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "推送失败。常见原因：" -ForegroundColor Yellow
    Write-Host "  1) 没认证：装 GitHub CLI 后 gh auth login，或用 Personal Access Token 当密码"
    Write-Host "  2) 远程仓库不是空的：新建仓库时别勾 README / .gitignore / License"
    Write-Host "  3) 分支名不一致：本仓库是 main，若远程是 master，先 git branch -M main"
    exit $LASTEXITCODE
}
Write-Host "推送完成 ✅  去 GitHub 刷新页面看看" -ForegroundColor Green
