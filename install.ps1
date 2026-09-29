# Panel installer for Windows. No admin rights needed.
#
#   powershell -c "irm https://raw.githubusercontent.com/jcordon5/panel/main/install.ps1 | iex"
#
# Installs (or updates) Panel in %LOCALAPPDATA%\Panel, downloads a private copy of
# Python if none is installed, creates Desktop and Start menu shortcuts and starts it.
# Your data (vault, settings, backups) is never touched when you run it again.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.ServicePointManager]::SecurityProtocol

$repo = 'jcordon5/panel'
$dest = Join-Path $env:LOCALAPPDATA 'Panel'
$pyVersion = '3.12.10'
$keep = @('vault', 'boveda', 'backups', 'python', 'panel.config.json')

Write-Host ''
Write-Host '  Installing Panel...' -ForegroundColor Cyan

$tmp = Join-Path $env:TEMP ('panel-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    # 1. latest release
    $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'panel-installer' }
    $asset = $rel.assets | Where-Object { $_.name -eq 'panel.zip' } | Select-Object -First 1
    $url = if ($asset) { $asset.browser_download_url } else { $rel.zipball_url }
    Write-Host "  Downloading Panel $($rel.tag_name)..."
    Invoke-WebRequest $url -OutFile "$tmp\panel.zip" -UseBasicParsing
    Expand-Archive "$tmp\panel.zip" -DestinationPath "$tmp\src" -Force
    $src = (Get-ChildItem "$tmp\src" -Recurse -Filter 'server.py' | Select-Object -First 1).DirectoryName
    if (-not $src) { throw 'The download does not look like Panel.' }

    # 2. copy the app (keeping user data)
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Get-ChildItem $src | Where-Object { $keep -notcontains $_.Name } | ForEach-Object {
        $target = Join-Path $dest $_.Name
        if ($_.PSIsContainer) {
            if (Test-Path $target) { Remove-Item $target -Recurse -Force }
            Copy-Item $_.FullName $target -Recurse
        } else {
            Copy-Item $_.FullName $target -Force
        }
    }

    # 3. Python: use an installed one, otherwise a private embeddable copy
    function Test-Python([string]$exe, [string[]]$pre) {
        try {
            & $exe @pre -c 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)' 2>$null | Out-Null
            return ($LASTEXITCODE -eq 0)
        } catch { return $false }
    }
    $hasPython = (Test-Python 'py' @('-3')) -or (Test-Python 'python' @())
    if (-not $hasPython -and -not (Test-Path "$dest\python\python.exe")) {
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ([Environment]::Is64BitOperatingSystem) { 'amd64' } else { 'win32' }
        Write-Host "  Downloading a private copy of Python $pyVersion ($arch)..."
        Invoke-WebRequest "https://www.python.org/ftp/python/$pyVersion/python-$pyVersion-embed-$arch.zip" -OutFile "$tmp\python.zip" -UseBasicParsing
        Expand-Archive "$tmp\python.zip" -DestinationPath "$dest\python" -Force
    }

    # 4. shortcuts (the console window starts minimised)
    $shell = New-Object -ComObject WScript.Shell
    $places = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
    foreach ($dir in $places) {
        if (-not $dir) { continue }
        $lnk = $shell.CreateShortcut((Join-Path $dir 'Panel.lnk'))
        $lnk.TargetPath = Join-Path $dest 'panel.bat'
        $lnk.WorkingDirectory = $dest
        $lnk.WindowStyle = 7
        $lnk.IconLocation = (Join-Path $dest 'app\panel.ico') + ',0'
        $lnk.Description = 'Panel - tasks, meetings and notes'
        $lnk.Save()
    }
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "  Panel is installed in $dest" -ForegroundColor Green
Write-Host '  Open it any time with the "Panel" icon on your Desktop or in the Start menu.'
Write-Host '  Your notes will live in:' (Join-Path $dest 'vault')
Write-Host ''
Start-Process -FilePath (Join-Path $dest 'panel.bat') -WorkingDirectory $dest -WindowStyle Minimized
