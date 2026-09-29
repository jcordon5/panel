@echo off
rem Panel - double-click to start (Windows). Keep this window open while you use it.
setlocal
cd /d "%~dp0"
title Panel
set "PANEL_LAUNCHER=1"

rem 1) portable Python installed by install.ps1, 2) the py launcher, 3) python on PATH
if exist "%~dp0python\python.exe" (
  set "PYEXE=%~dp0python\python.exe"
  set "PYARGS="
  goto run
)
py -3 -c "import sys" >nul 2>nul
if %errorlevel%==0 (
  set "PYEXE=py"
  set "PYARGS=-3"
  goto run
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>nul
if %errorlevel%==0 (
  set "PYEXE=python"
  set "PYARGS="
  goto run
)
echo.
echo  Python 3 was not found / No se ha encontrado Python 3.
echo  Easiest: reinstall Panel with / Lo mas facil: reinstala Panel con
echo    powershell -c "irm https://raw.githubusercontent.com/jcordon5/panel/main/install.ps1 | iex"
echo  (it downloads a private copy of Python, no admin rights needed / descarga un Python privado, sin permisos de administrador)
echo.
pause
exit /b 1

:run
"%PYEXE%" %PYARGS% server.py %*
rem exit code 75 = restart after an update or a settings change
if %errorlevel%==75 goto run
if not %errorlevel%==0 pause
endlocal
