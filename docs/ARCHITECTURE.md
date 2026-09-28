# Hyd Simu — Arquitectura

> Simulador de circuitos hidráulicos para maquinaria forestal (canvas + motor de
> simulación + material didáctico). Documento vivo: se actualiza en cada etapa.

---

## 1. Estado actual (línea base, antes de la refactorización)

Aplicación **estática**, sin build ni dependencias: HTML + CSS + módulos ES nativos.

| Archivo | Tamaño | Rol |
|---|---:|---|
| `index.html` | 1.348 líneas / 95 KB | Estructura, SEO, **paleta de 54 componentes escrita a mano**, canvas, paneles, guía |
| `css/styles.css` | 737 líneas / 43 KB | Estilos |
| `js/app.js` | 11.069 líneas / 491 KB | **Monolito** en un único IIFE: datos didácticos, estado, dibujo ISO, interacción, motor, anotaciones, instrumentación, persistencia |
| `js/modules/*` | 1.061 líneas | Panel de propiedades "avanzado" + cálculos por componente → **código muerto** (§2.1) |
| `_legacy/app_original.js` | 8.977 líneas | Backup antiguo sin referencias (movido a `_legacy/` en E0) |

### Cómo se representan los datos

```js
// Componente: MODELO + ESTADO DE SIMULACIÓN mezclados en el mismo objeto
{ id, type, x, y, orient /*0..3*/, values:{ /*params*/ }, extension, rotation, reading,
  _localPressure, _localFlow, _speedFactor, _extending, _stalled, _inputRPM,
  _outputRPM1..3, _outputPower1..3, _dividerRatioA, _reliefActive, _sequenceOpen … }

// Conexión: el RESULTADO de la simulación se escribe sobre la conexión
{ from:{ compId, portIdx }, to:{ compId, portIdx }, waypoints?,
  pressure, flow, flowDir /*+1/-1*/, rpm, power, torque, ratio }

// Puertos: posición relativa + dirección + etiqueta ISO 1219
COMP_DEFS[type] = { name, w, h, ports:[{x,y,dir,label}], params:{ key:{label,min,max,step,def} } }
```

### Cómo se simula (motor topológico, `computeCircuit`)

1. `buildAdjacency()` → mapa `"compId:portIdx" → [{connIdx, otherCompId, otherPortIdx}]`.
2. Reset de ~25 campos `_…` de componentes y de `pressure/flow/flowDir` de conexiones.
3. Fuentes: `engine`, `pump-drive`, `pump-var-displacement`, `pump`.
4. Presión de sistema = `min(presión de bomba, ajuste del alivio)`, **solo para los readouts**;
   la propagación del BFS parte de la presión de la bomba.
5. BFS con cola de nodos `{compId, portIdx, pressure, flow, connIdx, fromCompId, fromPortIdx}` y
   **pérdidas fijas**: válvula direccional `×0.97` P / `×0.99` Q, secuencia `×0.98`, filtro `×0.98`,
   enfriador `×0.97`, genérico `×0.99`.
6. Casos por tipo en fases ("PASO 10..14"): DCV (`getDcvRouting`), válvula de secuencia (histéresis 85 %),
   motor Poclain, cilindros (`_speedFactor = caudal/30 × 0.8`, fuerza `P × 0.1 × A / 1000` [kN]),
   motores (`_rpm`, par), passthrough genérico de 2 puertos.
7. Resultado → `updateReadouts()` (DOM), `updateDcvPositions()`, `_hcUpdateDiagnostics()`.
8. `animateSimulation()` (rAF): partículas sobre la polilínea, animación de cilindros/motores y
   **recálculo del circuito en cada frame**.

### Cómo se visualiza

- Conexión: grosor según `running`, color por presión (>10 bar rojo, >0 azul, parado gris),
  caja con **`P bar` + `Q L/min`** y flecha de dirección según `flowDir` (`drawConnection`, `app.js:1919`).
- Partículas animadas por conexión (`drawParticles`).
- Panel de propiedades (`#props-panel`) con parámetros + "Datos en Tiempo Real".

## 2. Problemas identificados (análisis previo a la refactorización)

> **Estado tras E1 + E2.** Ya resueltos: el motor extraído a `js/core/**` (dominio puro) **E1** ·
> panel de componentes con contrato único `ComponentSpec`, solver dirigido por roles y sin
> `if (comp.type === …)` **E2** · pérdidas en un solo modelo **E2** · física corregida D1–D5 **E2**.
> Pendientes: paleta y símbolos generados desde el registro **E3** · panel educativo **E4** ·
> panel muerto, `isTankPort`/`deepClone` duplicados y sistema de unidades **E5**.

### 2.1 Código muerto y duplicación

- **Panel avanzado inalcanzable**: `js/modules/properties-panel.js` busca `#props-panel-advanced`,
  `#props-content`, `#props-title`, `#props-close` y `.props-tab`, que **no existen** en `index.html`
  ni en `css/styles.css` → `initPropertiesPanel()` sale antes de tiempo. Aun así `js/app.js` lo
  inicializa **dos veces** (líneas 764-791 y 11042-11064) y mantiene un `setInterval` cada 500 ms que
  consulta un panel inexistente. `js/app.js:1` importa `getPumpPerformanceValues` y
  `getCylinderPerformanceValues` y **nunca los usa**.
- **Doble implementación de los cálculos**: `getPerformanceValues()` (`app.js`) recalcula lo mismo que
  `js/modules/{pump,cylinder,pump-drive}-calculations.js`, con fórmulas y campos divergentes.
- `isTankPort` y `deepClone` están duplicados (`app.js` y `js/modules/utils.js`).

### 2.2 Acoplamiento: agregar un componente toca ~10 lugares

`COMP_DEFS`, paleta HTML, `PORT_DESC`, `isTankPort`, icono de paleta, símbolo + switch de 54 casos,
`getDcvRouting`, `getComponentPassthrough`, `computeCircuit` (PASO 10-14), `getPerformanceValues`,
`validateCircuit`, circuitos predefinidos y diagnóstico. Evidencia: `'poclain-ms35'` aparece en 11
líneas de `app.js`, `'cylinder-da'` en 26, `'orifice'` en 6.

### 2.3 Sin separación interfaz ↔ lógica

`computeCircuit()` vive dentro del IIFE con acceso directo a `components`, `connections`, `COMP_DEFS`,
`activeFault` y llama a funciones de DOM (`updateReadouts`, `_hcUpdateDiagnostics`). No es posible
probar la física sin navegador.

### 2.4 Regresiones detectadas respecto a `_legacy/app_original.js`

1. **Fuerza y velocidad del cilindro siempre 0**: `app.js:8334` llama
   `updateReadouts(sysPressure, pumpFlow, 0, 0, …)`; antes se pasaban los valores reales.
2. **Se perdió la conversión de unidades** métrico/imperial (`UNIT_DEFS`, `convDisp`, `#unit-tabs`).
3. **El ajuste del alivio no limita la presión de línea**: `sysPressure` solo alimenta los readouts;
   el BFS parte de `pump._pressure` (distinto de `app_original.js`).

### 2.5 Calidad

Sin tests, sin tipado, sin linting; mezcla de `var`/`const`, indentación 2/4 y bloques pegados a
indentación 0; `console.log` de depuración; stubs no-op (`markPathsDirty`).

---

## 3. Arquitectura objetivo

Separación estricta **modelo → solver → componentes → conexiones → interfaz**, sin bundler y sin
dependencias nuevas.

```
js/
├─ core/                    DOMINIO PURO (sin DOM, 100 % testeable)
│   ├─ component-definitions.js  catálogo de componentes (E1)
│   ├─ units.js                  unidades y conversión (E2)
│   ├─ model.js                  Circuit/Component/Connection + validación (E2)
│   ├─ registry.js               ComponentRegistry: type → ComponentSpec (E2)
│   └─ simulation/
│       ├─ graph.js              adyacencia puerto↔conexión (E1)
│       ├─ valve-routing.js      ruteo interno de válvulas direccionales (E1)
│       ├─ passthrough.js        conductividad/restricciones por tipo (E1)
│       ├─ dcv-positions.js      posición de DCV según comando externo (E1)
│       ├─ solver.js             BFS + fases del algoritmo (E1)
│       └─ index.js              barrel del motor
├─ components/               una familia por archivo, autoregistro (E2)
├─ rendering/                routing geométrico, símbolos, paleta, canvas (E3)
├─ ui/                       controlador, panel de propiedades, panel educativo (E3/E4)
└─ app.js                    entry point: registra componentes y arranca la UI
```

### Contrato `ComponentSpec` (E2)

Único punto de extensión: `type`, `label`, `category`, `size`, `ports`, `params`, `physics`
(`internalRouting` / `conduct` / `solve` / `dynamics`), `metrics(vm)`, `warnings(vm)`, `docs` y
`equations(vm)` (panel educativo), `symbol`, `paletteIcon`. Añadir un componente =
**1 archivo + 1 línea de registro**.

### Puente de compatibilidad

Durante la migración, los campos `comp._localPressure`, `comp._localFlow`, `comp._speedFactor`, etc.
se conservan como aliases de solo lectura sobre `comp.sim` (`Object.defineProperty`), de forma que el
código antiguo (dibujo, animación, diagnóstico) siga funcionando sin cambios.

## 4. Plan de migración y estado

| Etapa | Contenido | Estado |
|---|---|---|
| **E0** | Congelar: `docs/`, backup a `_legacy/`, borrar archivo vacío y `console.log` de depuración | ✅ hecho |
| **E1** | Extraer el motor a `js/core/**` con **equivalencia 1:1** + suite de tests en `tests/` | ✅ hecho |
| **E2** | `ComponentRegistry` + `js/components/*` (familias con su física), solver dirigido por roles, pérdidas unificadas y corrección de D1–D4 + D5 | ✅ hecho |
| **E3** | Paleta y símbolos generados desde el registro; `drawComponent` sin el switch de 54 casos; definiciones dentro de los specs | pendiente |
| **E4** | Panel educativo bajo el tablero (`spec.docs` + `spec.equations` + `spec.metrics`); revivir `js/modules/*-calculations.js` como specs | ✅ hecho (descripción, puertos, variables y **fórmulas con sustitución numérica** para los 54 componentes; el sistema de unidades SI/Imperial también restaurado, D6) |
| **E5** | Limpieza: panel muerto e init duplicado, unificar `isTankPort`/`deepClone`, JSDoc, validación | pendiente |

### Qué cambió en E4 (guía de componentes + unidades)

```
js/core/units.js            conversión SI ↔ Imperial (bar/psi, L/min/gpm, kN/lbf, …) — núcleo puro
js/ui/componentDocs.js      constructor de HTML del panel (función pura, testeable)
js/components/*.js          cada spec añade `docs` (resumen, funcionamiento, puertos, variables,
                            consejos, símbolo ISO) y `equations(vm)` con las fórmulas de diseño
index.html                  panel `#edu-panel` bajo el tablero + selector de unidades (#unit-tabs)
css/styles.css              estilos .edu-* y del selector
js/app.js                   selección → guía; refresco en vivo (250 ms); conversión de unidades en
                            readouts, etiquetas del canvas, panel de propiedades y guía
tests/cases/units.test.js             conversión, etiquetas, decimales, ida y vuelta
tests/cases/component-docs*.test.js   construcción del panel y robustez
tests/cases/docs-coverage.test.js     los 54 componentes documentados, en SI y en Imperial
```

- **Toda la matemática interna sigue en SI**; el cambio de unidades es solo de presentación
  (`localStorage['hydsim.units']` recuerda la preferencia).
- Las fórmulas muestran la expresión general, la **sustitución con los valores medidos** y el
  resultado en el sistema activo, p. ej. `F = 145.5 × 5026.5 × 0.1 / 1000 = 73.1 kN` (o `16,434 lbf`).
- El test `docs-coverage` impide que un componente nuevo se quede sin documentación.

### Qué cambió en E2

```
js/core/registry.js                ComponentRegistry: type → ComponentSpec (con validación)
js/components/valves-directional.js   9 válvulas direccionales (internalRouting)
js/components/valves-flow.js          9 restricciones y antirretornos (conduct)
js/components/valves-distribution.js  6 de reparto/prioridad/intensificador (conduct, multi-salida)
js/components/valves-pressure.js      6 de presión (conduct con histéresis)
js/components/conditioning.js         5 acondicionadores + 6 instrumentos (conduct/solve)
js/components/actuators.js            7 actuadores (conduct + solve: fuerza, par, rpm)
js/components/sources.js              6 fuentes (rol)
js/components/index.js                registerAllComponents() — catálogo de 54 componentes
tests/legacy/*                        copia congelada del motor anterior para pruebas de equivalencia
```

- **El solver ya no contiene cadenas `if (comp.type === …)`**: despacha por `spec.role`
  (`valve-directional`, `actuator-linear`, `instrument`, …) y por `spec.physics`
  (`internalRouting`, `conduct`, `solve`, `noConduction`).
- **Agregar un componente** ahora es: crear el spec en su familia (`type`, `label`, `role`, `physics`),
  añadirlo al array y registrar su definición/paleta. El solver y la interfaz no se tocan.
- **Física corregida** (con tests nuevos que la fijan): ver `docs/BASELINE.md` §3.
- La migración de reglas se validó comparando **todo el catálogo** contra una copia congelada del
  motor anterior (8 estados × 6 presiones × 3 caudales × todos los puertos): las 4 claves del
  contrato (`canFlow`, `outPort`, `pressureDrop`, `flowLimit`) son idénticas.
- Backups de la etapa: `_legacy/core-before-e2/` (núcleo previo) y `_legacy/solver-before-e2.js`.

### Qué cambió en E1

```
js/core/component-definitions.js   catálogo COMP_DEFS (54 tipos) — datos puros
js/core/simulation/graph.js        buildAdjacency(connections)
js/core/simulation/valve-routing.js  getDcvRouting(comp)
js/core/simulation/passthrough.js  getComponentPassthrough(comp, port, p, q)
js/core/simulation/dcv-positions.js  updateDcvPositions(components)
js/core/simulation/solver.js       solveCircuit({components, connections, definitions, activeFault})
js/core/simulation/index.js        barrel del núcleo
tests/                             suite de 200+ aserciones + runner en navegador
tools/e1-extract-core.ps1          script de migración (con aserciones y backup)
tools/run-tests.ps1                ejecución headless de la suite (sin Node)
```

- `js/app.js` pasó de **11.069 a 9.511 líneas**: ya no contiene `COMP_DEFS` ni el motor;
  conserva un adaptador `computeCircuit()` de ~20 líneas que llama a `solveCircuit()` y
  aplica el resultado a la interfaz (readouts + instrumentación). También se eliminaron en
  E0 los dos `console.log` de depuración (`'test', components` y el del panel avanzado).
- El motor es ahora **dominio puro**: recibe `{components, connections, definitions, activeFault}`
  y devuelve `{systemPressure, pumpFlow, force, speed, status, completed}`.
- Comportamiento **idéntico**: el código se copió literalmente (mismas constantes y fórmulas);
  `tools/e1-verify-extraction.ps1` compara los módulos con el backup previo a la extracción.
- Backup previo: `_legacy/app.js.before-e1` (11.069 líneas).

### Cómo validar

- Tests del núcleo: `powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1`
  (arranca `python -m http.server`, ejecuta `tests/index.html` en Chrome/Edge headless y
  escribe `_test-report.txt`; con `-Page index.html` valida además que la aplicación carga
  sin errores de consola).
- Equivalencia de la extracción: `tools/e1-verify-extraction.ps1` → `_verify-report.txt`.
- Estado actual verificado: **203/203 tests OK**, app sin errores de consola y núcleo
  idéntico al monolito previo (6/6 módulos).
- Checklist funcional manual: ver `docs/BASELINE.md` (§1 y §4).
- La consola del navegador debe mostrar únicamente el aviso ya existente del panel de
  propiedades avanzado (código muerto, se retira en E5).

### Desviaciones y decisiones pendientes

Ver `docs/BASELINE.md` §3 (D1–D8): el alivio que no limita la línea, los componentes de
3+ puertos que no propagan, las restricciones que no se consultan, y la fuerza/velocidad
de cilindro que muestran siempre 0. Son funcionalidades a restaurar/corregir **con decisión
explícita**, porque cambian resultados visibles.


