# ================================================================
# E1 - VERIFICACION DE EQUIVALENCIA 1:1 DE LA EXTRACCION
# ================================================================
# Comprueba que cada modulo de js/core/ sigue siendo exactamente el codigo que
# estaba en el monolito antes de la extraccion (_legacy/app.js.before-e1),
# aplicando solo las transformaciones documentadas (cabecera del modulo y
# cambio de firma para exportar).
#
# Protege contra "deriva": si alguien edita a mano un modulo del nucleo, este
# script lo detecta comparando con el backup.
#
# Uso: powershell -ExecutionPolicy Bypass -File tools\e1-verify-extraction.ps1
# ================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$backup = '_legacy\app.js.before-e1'
if (-not (Test-Path $backup)) { throw 'Falta el backup _legacy\app.js.before-e1' }

$bakLines = ([System.IO.File]::ReadAllText((Resolve-Path $backup))) -split "`n"

# 'Compare' es un alias de Compare-Object en PowerShell: se elimina para poder
# usar nuestro propio comparador con el mismo nombre.
Remove-Item alias:Compare -ErrorAction SilentlyContinue

$report = New-Object System.Collections.ArrayList
function Say([string]$text) {
  [void]$script:report.Add($text)
  Write-Host $text
}

function Slice([int]$from, [int]$to) { , ($bakLines[($from - 1)..($to - 1)]) }

function ModuleBlock([string]$path, [string]$anchor) {
  $lines = ([System.IO.File]::ReadAllText((Resolve-Path $path))) -split "`n"
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Contains($anchor)) { return , ($lines[$i..($lines.Count - 1)]) }
  }
  throw ("No se encontro el ancla '{0}' en {1}" -f $anchor, $path)
}

$failures = 0
$changedInE2Count = 0

# Modulos que la etapa E2 cambio de forma intencionada (delegacion al registro
# y solver dirigido por roles). Su equivalencia con el monolito ya no aplica:
# su correccion la garantiza la suite de tests (tests/cases/*).
function Check-Equivalent([string]$name, [object[]]$expected, [object[]]$actual, [switch]$ChangedInE2) {
  if ($ChangedInE2) {
    $script:changedInE2Count++
    Say ("  INFO  {0} (cambio intencionado en E2; lo verifica la suite de tests)" -f $name)
    return
  }
  $e = ($expected -join "`n").TrimEnd("`n")
  $a = ($actual -join "`n").TrimEnd("`n")
  if ($e -eq $a) {
    Say ("  OK    {0}" -f $name)
    return
  }
  $script:failures++
  Say ("  DIFF  {0}" -f $name)
  $el = $e -split "`n"; $al = $a -split "`n"
  $max = [Math]::Max($el.Count, $al.Count)
  $shown = 0
  for ($i = 0; $i -lt $max -and $shown -lt 6; $i++) {
    $x = if ($i -lt $el.Count) { $el[$i] } else { '<falta>' }
    $y = if ($i -lt $al.Count) { $al[$i] } else { '<falta>' }
    if ($x -ne $y) {
      Say ("        linea {0}:" -f ($i + 1))
      Say ("          backup: {0}" -f $x.Trim())
      Say ("          modulo: {0}" -f $y.Trim())
      $shown++
    }
  }
}

Say 'Verificando equivalencia 1:1 con el monolito previo a la extraccion...'

# Catalogo
$defsExp = Slice 514 763
$defsExp = $defsExp | ForEach-Object { $_.Replace('var COMP_DEFS = {', 'export const COMP_DEFS = {') }
Check-Equivalent 'js/core/component-definitions.js' $defsExp (ModuleBlock 'js\core\component-definitions.js' 'export const COMP_DEFS = {')

# Grafo
$graphExp = Slice 7035 7046
$graphExp = $graphExp | ForEach-Object { $_.Replace('function buildAdjacency() {', 'export function buildAdjacency(connections) {') }
Check-Equivalent 'js/core/simulation/graph.js' $graphExp (ModuleBlock 'js\core\simulation\graph.js' 'export function buildAdjacency(connections) {')

# Ruteo de valvulas
$routingExp = Slice 7061 7138
$routingExp = $routingExp | ForEach-Object { $_.Replace('function getDcvRouting(comp) {', 'export function getDcvRouting(comp) {') }
Check-Equivalent 'js/core/simulation/valve-routing.js' $routingExp (ModuleBlock 'js\core\simulation\valve-routing.js' 'export function getDcvRouting(comp) {') -ChangedInE2

# Posiciones de DCV
$dcvExp = Slice 5752 5780
$dcvExp = $dcvExp | ForEach-Object { $_.Replace('function updateDcvPositions() {', 'export function updateDcvPositions(components) {') }
Check-Equivalent 'js/core/simulation/dcv-positions.js' $dcvExp (ModuleBlock 'js\core\simulation\dcv-positions.js' 'export function updateDcvPositions(components) {')

# Passthrough
$passExp = Slice 7144 7425
$passExp = $passExp | ForEach-Object { $_.Replace('function getComponentPassthrough(comp, inPortIdx, pressure, flow) {', 'export function getComponentPassthrough(comp, inPortIdx, pressure, flow) {') }
Check-Equivalent 'js/core/simulation/passthrough.js' $passExp (ModuleBlock 'js\core\simulation\passthrough.js' 'export function getComponentPassthrough(comp, inPortIdx, pressure, flow) {') -ChangedInE2

# Solver (con las transformaciones documentadas en tools/e1-extract-core.ps1)
$solverExp = (Slice 7427 8343) -join "`n"
$solverExp = $solverExp.Replace('function computeCircuit() {', @'
export function solveCircuit(circuit) {
    var components = (circuit && circuit.components) || [];
    var connections = (circuit && circuit.connections) || [];
    var COMP_DEFS = (circuit && circuit.definitions) || {};
    var activeFault = (circuit && circuit.activeFault) || 'none';

    /* Localizador local: equivalente 1:1 al findComp() del monolito */
    function findComp(id) {
        for (var i = 0; i < components.length; i++) {
            if (components[i].id === id) return components[i];
        }
        return null;
    }
'@)
$solverExp = $solverExp.Replace('    var adj = buildAdjacency();', '    var adj = buildAdjacency(connections);')
$solverExp = $solverExp.Replace("        updateReadouts(0, 0, 0, 0, 'No pump');`n        return;", "        return {`n            systemPressure: 0,`n            pumpFlow: 0,`n            force: 0,`n            speed: 0,`n            status: 'No pump',`n            completed: false`n        };")
$solverExp = $solverExp.Replace('    // PASO 15: Actualizar readouts', '    // PASO 15: Actualizar posiciones de valvulas direccionales')
$solverExp = $solverExp.Replace("    updateReadouts(sysPressure, pumpFlow, 0, 0, finalStatus);`n    updateDcvPositions();", '    updateDcvPositions(components);')
$solverExp = [regex]::Replace($solverExp, '(?m)^    // PASO 16: Actualizar instrumentaci.*$', '    // PASO 16: Devolver el resultado a la capa de interfaz')
$solverExp = $solverExp.Replace("    if (typeof _hcUpdateDiagnostics === 'function') {`n        _hcUpdateDiagnostics(sysPressure, pumpFlow, 0, 0);`n    }`n}", "    return {`n        systemPressure: sysPressure,`n        pumpFlow: pumpFlow,`n        force: 0,`n        speed: 0,`n        status: finalStatus,`n        completed: true`n    };`n}")
Check-Equivalent 'js/core/simulation/solver.js' ($solverExp -split "`n") (ModuleBlock 'js\core\simulation\solver.js' 'export function solveCircuit(circuit) {') -ChangedInE2

Say ''
$reportPath = Join-Path $root '_verify-report.txt'
if ($failures -gt 0) {
  Say ("RESULTADO: {0} modulo(s) con diferencias respecto al backup" -f $failures)
  [System.IO.File]::WriteAllText($reportPath, ($report -join "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
  exit 1
}
Say 'RESULTADO: OK - los modulos sin cambios son identicos al monolito previo (equivalencia 1:1)'
if ($changedInE2Count -gt 0) {
  Say ("           {0} modulo(s) modificados intencionadamente en la etapa E2 (verificados por la suite de tests)" -f $changedInE2Count)
}
[System.IO.File]::WriteAllText($reportPath, ($report -join "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
exit 0
