# ================================================================
# E1 - EXTRAER EL NUCLEO DE SIMULACION A js/core/  (migracion 1:1)
# ================================================================
# Script de migracion de un solo uso (etapa E1). Hace tres cosas:
#   1) Verifica (asserts) los rangos de linea del monolito js/app.js.
#   2) Genera los modulos de js/core/ copiando el codigo **verbatim**.
#   3) Reescribe js/app.js: quita los bloques extraidos e inserta los imports
#      y un wrapper computeCircuit() que delega en solveCircuit().
#
# La semantica se preserva: no se modifica ni una constante ni una formula.
# Antes de escribir, exige que exista la copia de seguridad
# _legacy/app.js.before-e1 (se crea si falta).
# ================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$appPath = 'js\app.js'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# -- Copia de seguridad ------------------------------------------
New-Item -ItemType Directory -Force -Path '_legacy' | Out-Null
if (-not (Test-Path '_legacy\app.js.before-e1')) {
  Copy-Item $appPath '_legacy\app.js.before-e1'
  Write-Host 'Backup creado: _legacy\app.js.before-e1'
}

$raw = [System.IO.File]::ReadAllText((Resolve-Path $appPath))
if ($raw -match "`r`n") { throw 'Se esperaba un archivo con finales de linea LF' }
$L = $raw -split "`n"

function Line([int]$n) { $L[$n - 1] }
function Range([int]$from, [int]$to) { , ($L[($from - 1)..($to - 1)]) }
function Assert-Starts([int]$n, [string]$prefix) {
  if (-not (Line $n).TrimStart().StartsWith($prefix)) {
    throw ("Assert fallo en linea {0}: se esperaba el prefijo '{1}' y hay '{2}'" -f $n, $prefix, (Line $n))
  }
}
function Assert-Line([int]$n, [string]$expected) {
  if ((Line $n).Trim() -ne $expected) {
    throw ("Assert fallo en linea {0}: se esperaba '{1}' y hay '{2}'" -f $n, $expected, (Line $n).Trim())
  }
}
function Write-Module([string]$path, [object[]]$lines) {
  [System.IO.File]::WriteAllText((Join-Path $root $path), ($lines -join "`n") + "`n", $utf8)
  Write-Host ("  escrito {0} ({1} lineas)" -f $path, $lines.Count)
}

# -- 1) Verificacion de rangos -----------------------------------
Write-Host 'Verificando rangos del monolito...'
Assert-Starts 514 'var COMP_DEFS = {'
Assert-Line   763 '};'
Assert-Starts 5752 'function updateDcvPositions() {'
Assert-Line   5780 '}'
Assert-Starts 7035 'function buildAdjacency() {'
Assert-Line   7046 '}'
Assert-Starts 7061 'function getDcvRouting(comp) {'
Assert-Line   7138 '}'
Assert-Starts 7144 'function getComponentPassthrough(comp, inPortIdx, pressure, flow) {'
Assert-Line   7425 '}'
Assert-Starts 7427 'function computeCircuit() {'
Assert-Line   8343 '}'
Assert-Line   7835 "updateReadouts(0, 0, 0, 0, 'No pump');"
Assert-Line   7836 'return;'
Assert-Line   8334 'updateReadouts(sysPressure, pumpFlow, 0, 0, finalStatus);'
Assert-Line   8335 'updateDcvPositions();'
Assert-Line   8341 '_hcUpdateDiagnostics(sysPressure, pumpFlow, 0, 0);'
Write-Host '  OK: los rangos coinciden con lo esperado.'

New-Item -ItemType Directory -Force -Path 'js\core\simulation' | Out-Null

# -- 2) js/core/component-definitions.js (lineas 514-763) --------
$defs = Range 514 763
$defs = $defs | ForEach-Object { $_.Replace('var COMP_DEFS = {', 'export const COMP_DEFS = {') }
if (-not (($defs -join "`n") -match 'export const COMP_DEFS')) { throw 'No se pudo exportar COMP_DEFS' }
Write-Module 'js\core\component-definitions.js' (@(
    '// ================================================================',
    '// CATALOGO DE COMPONENTES HIDRAULICOS (datos puros, sin DOM)',
    '// ================================================================',
    '//',
    '// Extraido 1:1 de js/app.js (bloque COMP_DEFS) en la etapa E1.',
    '// Cada entrada describe: nombre visible, tamano del simbolo ISO, puertos',
    '// (posicion relativa + direccion + etiqueta) y parametros editables',
    '// (slider/select con min, max, step y valor por defecto).',
    '//',
    '// NOTA (etapa E2): este objeto sera sustituido por el ComponentRegistry,',
    '// donde cada familia (js/components/*.js) aporta su definicion y su fisica,',
    '// de modo que anadir un componente sea 1 archivo + 1 registro.',
    '// ================================================================',
    ''
  ) + $defs)

# -- 3) js/core/simulation/graph.js (lineas 7031-7046) -----------
$graph = Range 7031 7046
$graph = $graph | ForEach-Object { $_.Replace('function buildAdjacency() {', 'export function buildAdjacency(connections) {') }
if (-not (($graph -join "`n") -match 'export function buildAdjacency')) { throw 'No se pudo exportar buildAdjacency' }
Write-Module 'js\core\simulation\graph.js' (@(
    '// ================================================================',
    '// GRAFO DEL CIRCUITO - adyacencia puerto <-> conexion',
    '// ================================================================',
    '//',
    '// Extraido 1:1 de js/app.js en la etapa E1. Dominio puro: no toca el DOM,',
    '// por lo que puede usarse desde tests o desde cualquier otro consumidor.',
    '// ================================================================',
    ''
  ) + $graph)

# -- 4) js/core/simulation/valve-routing.js (7048-7138) ----------
$routing = Range 7048 7138
$routing = $routing | ForEach-Object { $_.Replace('function getDcvRouting(comp) {', 'export function getDcvRouting(comp) {') }
if (-not (($routing -join "`n") -match 'export function getDcvRouting')) { throw 'No se pudo exportar getDcvRouting' }
Write-Module 'js\core\simulation\valve-routing.js' (@(
    '// ================================================================',
    '// RUTEO INTERNO DE VALVULAS DIRECCIONALES',
    '// ================================================================',
    '//',
    '// Extraido 1:1 de js/app.js en la etapa E1. Para la posicion actual de la',
    '// valvula devuelve los pares de puertos conectados internamente, o null si',
    '// el componente no es una valvula direccional.',
    '// ================================================================',
    ''
  ) + $routing)

# -- 5) js/core/simulation/dcv-positions.js (5752-5780) ----------
$dcvPos = Range 5752 5780
$dcvPos = $dcvPos | ForEach-Object { $_.Replace('function updateDcvPositions() {', 'export function updateDcvPositions(components) {') }
if (-not (($dcvPos -join "`n") -match 'export function updateDcvPositions')) { throw 'No se pudo exportar updateDcvPositions' }
Write-Module 'js\core\simulation\dcv-positions.js' (@(
    '// ================================================================',
    '// POSICION DE VALVULAS DIRECCIONALES SEGUN COMANDO EXTERNO',
    '// ================================================================',
    '//',
    '// Extraido 1:1 de js/app.js en la etapa E1. Traduce el parametro',
    '// comp.values._externalCommand (p. ej. pilotaje por presion) en la posicion',
    '// efectiva de la valvula antes de propagar el flujo.',
    '// ================================================================',
    ''
  ) + $dcvPos)

# -- 6) js/core/simulation/passthrough.js (7140-7425) ------------
$pass = Range 7140 7425
$pass = $pass | ForEach-Object { $_.Replace('function getComponentPassthrough(comp, inPortIdx, pressure, flow) {', 'export function getComponentPassthrough(comp, inPortIdx, pressure, flow) {') }
if (-not (($pass -join "`n") -match 'export function getComponentPassthrough')) { throw 'No se pudo exportar getComponentPassthrough' }
Write-Module 'js\core\simulation\passthrough.js' (@(
    '// ================================================================',
    '// CONDUCTIVIDAD / RESTRICCIONES POR COMPONENTE',
    '// ================================================================',
    '//',
    '// Extraido 1:1 de js/app.js en la etapa E1. Dado un componente, el puerto de',
    '// entrada y las condiciones de presion/caudal, indica si el fluido puede',
    '// atravesarlo, por que puerto sale, la caida de presion y el caudal limitado.',
    '//',
    '// NOTA (etapa E2): cada rama de este if-chain se convertira en el metodo',
    '// `physics.conduct()` del ComponentSpec correspondiente.',
    '// ================================================================',
    '',
    "import { getDcvRouting } from './valve-routing.js';",
    ''
  ) + $pass)

# -- 7) js/core/simulation/solver.js (7427-8343) -----------------
$solverText = (Range 7427 8343) -join "`n"

$solverText = $solverText.Replace('function computeCircuit() {', @'
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

$pairs = @(
  @('    var adj = buildAdjacency();', '    var adj = buildAdjacency(connections);'),
  @("        updateReadouts(0, 0, 0, 0, 'No pump');`n        return;", "        return {`n            systemPressure: 0,`n            pumpFlow: 0,`n            force: 0,`n            speed: 0,`n            status: 'No pump',`n            completed: false`n        };"),
  @('    // PASO 15: Actualizar readouts', '    // PASO 15: Actualizar posiciones de valvulas direccionales'),
  @("    updateReadouts(sysPressure, pumpFlow, 0, 0, finalStatus);`n    updateDcvPositions();", '    updateDcvPositions(components);'),
  @('    // PASO 16: Actualizar instrumentación avanzada', '    // PASO 16: Devolver el resultado a la capa de interfaz'),
  @("    if (typeof _hcUpdateDiagnostics === 'function') {`n        _hcUpdateDiagnostics(sysPressure, pumpFlow, 0, 0);`n    }`n}", "    return {`n        systemPressure: sysPressure,`n        pumpFlow: pumpFlow,`n        force: 0,`n        speed: 0,`n        status: finalStatus,`n        completed: true`n    };`n}")
)
foreach ($p in $pairs) {
  $count = ([regex]::Matches($solverText, [regex]::Escape($p[0]))).Count
  if ($count -gt 1) {
    throw ("Se esperaba como maximo 1 ocurrencia de '{0}' y hay {1}" -f $p[0].Split("`n")[0], $count)
  }
  if ($count -eq 1) { $solverText = $solverText.Replace($p[0], $p[1]) }
}

# El comentario del PASO 16 lleva tilde y PowerShell 5.1 lee este .ps1 como ANSI:
# se localiza por prefijo ASCII para no depender de la codificacion del script.
$withHeader = [regex]::Replace($solverText, '(?m)^    // PASO 16: Actualizar instrumentaci.*$', '    // PASO 16: Devolver el resultado a la capa de interfaz')
if ($withHeader -eq $solverText) { throw 'No se encontro el comentario del PASO 16' }
$solverText = $withHeader

# Guardas: el solver debe contener lo nuevo y no debe contener nada de la interfaz
foreach ($must in @(
    'export function solveCircuit(circuit) {',
    'var adj = buildAdjacency(connections);',
    "status: 'No pump',",
    'status: finalStatus,',
    'updateDcvPositions(components);')) {
  if (-not $solverText.Contains($must)) { throw ("Falta '{0}' en solver.js" -f $must) }
}
foreach ($gone in @('function computeCircuit', 'updateReadouts', '_hcUpdateDiagnostics')) {
  if ($solverText.Contains($gone)) { throw ("Sigue apareciendo '{0}' en solver.js" -f $gone) }
}

Write-Module 'js\core\simulation\solver.js' (@(
    '// ================================================================',
    '// SOLVER DE CIRCUITOS HIDRAULICOS (dominio puro, sin DOM)',
    '// ================================================================',
    '//',
    '// Extraido 1:1 de computeCircuit() de js/app.js en la etapa E1: mismas',
    '// constantes, mismas formulas y mismo orden de fases (PASO 1..16). Recibe el',
    '// circuito como parametro y DEVUELVE el resultado; no escribe en el DOM.',
    '//',
    '// Entrada: { components, connections, definitions, activeFault }',
    '// Salida:  { systemPressure, pumpFlow, force, speed, status, completed }',
    '//',
    '// NOTA (etapa E2): los casos especiales por tipo (PASO 10..14) se convertiran',
    '// en llamadas al ComponentSpec (physics.internalRouting / conduct / solve).',
    '// ================================================================',
    '',
    "import { buildAdjacency } from './graph.js';",
    "import { getDcvRouting } from './valve-routing.js';",
    "import { getComponentPassthrough } from './passthrough.js';",
    "import { updateDcvPositions } from './dcv-positions.js';",
    ''
  ) + @($solverText -split "`n"))

# -- 8) js/core/simulation/index.js (barrel) ---------------------
Write-Module 'js\core\simulation\index.js' (@(
    '// ================================================================',
    '// NUCLEO DE SIMULACION (dominio puro, sin DOM)',
    '// ================================================================',
    '//',
    '// Punto de entrada del motor. La interfaz (js/app.js) solo necesita',
    '// solveCircuit(); el resto de modulos queda expuesto para los tests y para',
    '// las siguientes etapas (E2: ComponentRegistry).',
    '// ================================================================',
    '',
    "export { buildAdjacency } from './graph.js';",
    "export { getDcvRouting } from './valve-routing.js';",
    "export { getComponentPassthrough } from './passthrough.js';",
    "export { updateDcvPositions } from './dcv-positions.js';",
    "export { solveCircuit } from './solver.js';"
  ))

# -- 9) Reescribir js/app.js -------------------------------------
$wrapper = @(
  '  /* ================================================================',
  '     MOTOR DE SIMULACION - delegacion en el nucleo (js/core/simulation)',
  '     ================================================================ */',
  '',
  '  /*',
  '   * computeCircuit(): adaptador entre el estado de la interfaz y el nucleo de',
  '   * simulacion. El calculo vive en js/core/simulation/solver.js (dominio puro,',
  '   * testeable sin DOM). Aqui solo se pasan las referencias y se aplican los',
  '   * resultados a la interfaz: readouts e instrumentacion avanzada.',
  '   *',
  '   * Semantica preservada (etapa E1): mismo orden de llamadas y mismos valores',
  '   * que el computeCircuit() original; si no hay bomba el nucleo devuelve',
  '   * completed=false y no se actualiza la instrumentacion (igual que el return',
  '   * anticipado original).',
  '   */',
  '  function computeCircuit() {',
  '    var result = solveCircuit({',
  '      components: components,',
  '      connections: connections,',
  '      definitions: COMP_DEFS,',
  '      activeFault: activeFault',
  '    });',
  '    if (!result) return;',
  '',
  '    updateReadouts(result.systemPressure, result.pumpFlow, result.force, result.speed, result.status);',
  '',
  '    if (result.completed && typeof _hcUpdateDiagnostics === ''function'') {',
  '      _hcUpdateDiagnostics(result.systemPressure, result.pumpFlow, result.force, result.speed);',
  '    }',
  '  }'
)

$ops = @(
  @{ from = 510; to = 763; lines = @(
      '  /* ================================================================',
      '     COMPONENT DEFINITIONS -> importadas desde js/core/component-definitions.js',
      '     (etapa E1: dominio puro, sin DOM; en E2 pasaran al ComponentRegistry)',
      '     ================================================================ */') },
  @{ from = 5752; to = 5780; lines = @('  /* updateDcvPositions() vive ahora en js/core/simulation/dcv-positions.js (etapa E1) */') },
  @{ from = 7031; to = 7046; lines = @() },
  @{ from = 7048; to = 7138; lines = @() },
  @{ from = 7140; to = 7425; lines = @() },
  @{ from = 7427; to = 8343; lines = $wrapper }
)

$out = New-Object System.Collections.ArrayList
$cursor = 0
foreach ($op in ($ops | Sort-Object { $_.from })) {
  $fromIdx = $op.from - 1
  if ($fromIdx -gt $cursor) { [void]$out.AddRange(@($L[$cursor..($fromIdx - 1)])) }
  if (@($op.lines).Count -gt 0) { [void]$out.AddRange(@($op.lines)) }
  $cursor = $op.to
}
if ($cursor -lt $L.Count) { [void]$out.AddRange(@($L[$cursor..($L.Count - 1)])) }

# Imports del nucleo, justo despues del import existente
$idx = -1
for ($i = 0; $i -lt $out.Count; $i++) { if ($out[$i].StartsWith('import { PropertiesPanel')) { $idx = $i; break } }
if ($idx -lt 0) { throw 'No se encontro el import inicial de app.js' }
$out = @($out[0..$idx]) + @(
  "import { COMP_DEFS } from './core/component-definitions.js';",
  "import { solveCircuit } from './core/simulation/index.js';"
) + @($out[($idx + 1)..($out.Count - 1)])

[System.IO.File]::WriteAllText((Join-Path $root $appPath), ($out -join "`n"), $utf8)
Write-Host ("js/app.js: {0} -> {1} lineas" -f $L.Count, $out.Count)

# -- 10) Verificacion final --------------------------------------
$check = [System.IO.File]::ReadAllText((Resolve-Path $appPath))
$mustNot = @('var COMP_DEFS = {', 'function buildAdjacency', 'function getDcvRouting', 'function getComponentPassthrough', 'function updateDcvPositions')
foreach ($gone in $mustNot) {
  if ($check.Contains($gone)) { throw ("Sigue apareciendo '{0}' en app.js" -f $gone) }
}
foreach ($must in @('function computeCircuit() {', 'var result = solveCircuit({', "import { COMP_DEFS } from './core/component-definitions.js';")) {
  $n = ([regex]::Matches($check, [regex]::Escape($must))).Count
  if ($n -ne 1) { throw ("Se esperaba 1 ocurrencia de '{0}' en app.js y hay {1}" -f $must, $n) }
}
Write-Host 'Verificacion OK: el monolito ya no contiene el motor, solo el adaptador.'
