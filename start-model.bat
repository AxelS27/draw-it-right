@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0model-service\start.ps1" %*
if errorlevel 1 (
  echo.
  echo Model startup failed. See the error above or model-service\README.md.
  pause
  exit /b 1
)
