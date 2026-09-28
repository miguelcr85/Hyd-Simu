# ================================================================
# VALIDACION DE TESTS EN NAVEGADOR HEADLESS (sin Node)
# ================================================================
# Arranca el servidor estatico (si hace falta), ejecuta la suite de tests en
# Chrome/Edge en modo headless y escribe el informe en _test-report.txt.
#
# Uso:  powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1
#       powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1 -Page index.html
# ================================================================
param(
  [int]$Port = 8123,
  [string]$Page = 'tests/index.html',
  [string]$Browser = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# -- Navegador ----------------------------------------------------
if ($Browser) {
  $exe = $Browser
} else {
  $exe = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $exe) { throw 'No se encontro Chrome ni Edge en las rutas habituales' }
Write-Host ("Navegador: {0}" -f $exe)

# -- Servidor estatico -------------------------------------------
$url = "http://localhost:{0}/{1}" -f $Port, $Page
$up = $false
try {
  $up = (Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 3).StatusCode -eq 200
} catch { $up = $false }
if (-not $up) {
  Write-Host ("Arrancando python -m http.server {0}..." -f $Port)
  Start-Process python -ArgumentList @('-m', 'http.server', "$Port") -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
Write-Host ("URL: {0}" -f $url)

# -- Ejecucion headless ------------------------------------------
$tmp = $env:TEMP
$out = Join-Path $tmp ('hydsim-dom-' + [guid]::NewGuid().ToString('N') + '.html')
$err = $out + '.log'
# Perfil nuevo en cada ejecucion: evita que Chrome reutilice modulos cacheados
$prof = Join-Path $tmp ('hydsim-headless-' + [guid]::NewGuid().ToString('N'))

$chromeArgs = @(
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio',
  '--enable-logging=stderr', '--log-level=0',
  ("--user-data-dir={0}" -f $prof),
  '--virtual-time-budget=20000',
  '--dump-dom',
  $url
)

$proc = Start-Process -FilePath $exe -ArgumentList $chromeArgs -Wait -PassThru -NoNewWindow `
  -RedirectStandardOutput $out -RedirectStandardError $err
Write-Host ("ExitCode del navegador: {0}" -f $proc.ExitCode)

$dom = ''
if (Test-Path $out) { $dom = [System.IO.File]::ReadAllText($out) }
if (-not $dom) { throw 'El navegador no devolvio DOM (revisar el perfil headless o el servidor)' }

# -- Informe -----------------------------------------------------
$lines = New-Object System.Collections.ArrayList
$title = ''
if ($dom -match '(?s)<title>(.*?)</title>') { $title = $matches[1].Trim() }
[void]$lines.Add('TITULO: ' + $title)

$summary = ''
$summaryClass = ''
if ($dom -match '<div id="summary" class="([^"]*)">([^<]*)</div>') {
  $summaryClass = $matches[1]; $summary = $matches[2]
}
[void]$lines.Add(('RESUMEN [{0}]: {1}' -f $summaryClass, $summary))

foreach ($m in [regex]::Matches($dom, '<div id="fatals"[^>]*>([^<]*)</div>')) {
  if ($m.Groups[1].Value.Trim()) { [void]$lines.Add('FATAL: ' + $m.Groups[1].Value.Trim()) }
}

$fails = [regex]::Matches($dom, '<div class="case fail">([^<]*)</div>')
[void]$lines.Add('NUM FALLOS: ' + $fails.Count)
foreach ($m in $fails) {
  $txt = $m.Groups[1].Value -replace '&#39;', "'" -replace '&quot;', '"' -replace '&amp;', '&' -replace '&lt;', '<' -replace '&gt;', '>'
  [void]$lines.Add('FALLO: ' + $txt)
}
foreach ($m in [regex]::Matches($dom, '<div class="case suite">([^<]*)</div>')) {
  [void]$lines.Add('SUITE: ' + $m.Groups[1].Value)
}

# -- Consola del navegador (INFO:CONSOLE / ERROR:CONSOLE) --------
$consoleErrors = @()
$consoleInfo = @()
if (Test-Path $err) {
  foreach ($ln in [System.IO.File]::ReadAllLines($err)) {
    if ($ln -match 'CONSOLE') {
      if ($ln -match 'ERROR:CONSOLE' -or $ln -match 'Uncaught') { $consoleErrors += $ln.Trim() }
      else { $consoleInfo += $ln.Trim() }
    }
  }
}
[void]$lines.Add('ERRORES DE CONSOLA: ' + $consoleErrors.Count)
foreach ($ce in $consoleErrors) { [void]$lines.Add('CONSOLA-ERROR: ' + $ce) }
foreach ($ci in $consoleInfo) { [void]$lines.Add('CONSOLA: ' + $ci) }

[System.IO.File]::WriteAllText((Join-Path $root '_test-report.txt'), ($lines -join "`n") + "`n",
  (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host '===== INFORME (_test-report.txt) ====='
$lines | ForEach-Object { Write-Host $_ }
Write-Host '======================================'

if ($title -like 'FAIL*') { exit 1 }
exit 0
