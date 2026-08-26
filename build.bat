@echo off
setlocal enabledelayedexpansion

:: Builds the extension for both Chrome and Firefox from the shared src/
:: folder, stamping in the browser-specific manifest.json for each.
::
:: Usage: build.bat
:: Output: dist/chrome/  dist/firefox/  and matching .zip files in dist/

cd /d "%~dp0"

if exist dist rmdir /s /q dist
mkdir dist\chrome dist\firefox

for %%b in (chrome firefox) do (
  echo ==^> Building %%b...
  xcopy /e /i /y src\* dist\%%b\
  copy /y %%b\manifest.json dist\%%b\manifest.json

  :: Firefox has no Side Panel API — drop the file that's only useful on Chrome
  if "%%b"=="firefox" (
    if exist "dist\%%b\sidepanel.html" del "dist\%%b\sidepanel.html"
  )

  :: Create ZIP archive
  cd dist\%%b
  powershell -Command "Compress-Archive -Path * -DestinationPath ..\bookmark-status-checker-%%b.zip -Force"
  cd ..\..
  echo     -^> dist\bookmark-status-checker-%%b.zip
)

echo Done.
pause
