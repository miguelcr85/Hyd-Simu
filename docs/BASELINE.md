# Hyd Simu — Línea base funcional

Documento de referencia de **lo que la aplicación hace hoy** y de las
desviaciones conocidas. Se usa para verificar que la refactorización no cambia el
comportamiento y para decidir, más adelante, qué corregir.

---

## 1. Qué hay que preservar (checklist de regresión)

1. Paleta de 54 componentes por categorías, drag & drop y click para añadir, con iconos.
2. Mover (drag), rotar 90°, duplicar, borrar, undo/redo y atajos de teclado.
3. Conectar puertos (click puerto → puerto), enrutado ortogonal con waypoints y borrado de conexión.
4. 10 circuitos predefinidos con su descripción.
5. Run/Stop: partículas animadas, color de línea por presión, **etiquetas `P bar` + `Q L/min`**
   con flecha de dirección y botón 🏷️ para ocultarlas.
6. Readouts: presión de sistema, caudal, potencia, fuerza, velocidad y estado.
7. Panel de propiedades con sliders/selects y bloque "Datos en Tiempo Real".
8. **Guía del componente** bajo el tablero al seleccionar: nombre, descripción, puertos con valores,
   variables y uso, **fórmulas de diseño con sustitución numérica**, valores medidos y notas prácticas.
9. **Selector de unidades SI / Imperial** en la barra superior (afecta a readouts, etiquetas del canvas,
   panel de propiedades y guía).
8. Anotaciones/sketch, zoom/pan, fullscreen, exportar PNG, export/import JSON y guardado
   multi-slot en `localStorage`.
9. Modos Explore / Practice / Quiz y User Guide.
10. Instrumentación avanzada: inyección de fallas, diagnóstico y osciloscopio (CSV/PNG).
11. Estética, layout, CSS y SEO del HTML.

## 2. Constantes y fórmulas del motor (etapa E1)

| Elemento | Valor actual |
|---|---|
| Presión de sistema | `min(presión de bomba, ajuste de alivio)` — **es la presión con la que se propaga** (etapa E2) |
| Semilla del BFS | presión de sistema + caudal total de las bombas |
| Pérdida en válvula direccional | `×0.97` presión, `×0.99` caudal (declarado en `spec.drop`) |
| Pérdidas del resto de componentes | **bar de la tabla de reglas** (`filter` 1, `cooler` 2, `heater` 1, secuencia 2, antirretorno 0,5, orificio `Q²/(d²·2)`, etc.) |
| Componentes sin regla propia (2 puertos) | `×0.99` presión y caudal (declarable por spec) |
| Reparto de caudal (tee / divisor) | tee a partes iguales; divisor según `ratio` (60 % → 18 L/min de 30) |
| Fuerza del cilindro | `F [kN] = P [bar] × 0,1 × A [mm²] / 1000` (se informa al readout) |
| Velocidad del cilindro | `v [mm/s] = Q [L/min] × 1e6 / 60 / A [mm²]`; animación con `factor = Q / 30 × 0,8` |
| Par del motor | `T = P × V / (20π)`; `n = Q × 1000 / V` |
| Par del motor LSHT Poclain | `T = min(P×V/20π, Tmax) × ηmec`; `n = min(Q×1000/V × ηvol, nMax)` |
| Histéresis alivio / secuencia | 92 % / 85 % del ajuste |

> Las pérdidas son ahora **un único modelo** (las que declara cada componente en su spec),
> en lugar de porcentajes ad-hoc repartidos por el solver.

## 3. Desviaciones conocidas (verificadas con tests)

Se fijan en la suite para no cambiarlas por accidente; cada una requiere una
decisión explícita antes de corregirse.

| # | Desviación | Estado | Test |
|---|---|---|---|
| D1 | El ajuste del alivio no limitaba la presión de línea | ✅ **corregida en E2**: la propagación parte de la presión de sistema | `solver-source.test.js` |
| D2 | Los componentes de 3+ puertos no propagaban (`tee`, `shuttle`, `priority`, `flow-divider`, `and-valve`, `intensifier`, `pilot-check`) | ✅ **corregida en E2**: se reparte caudal y presión; la prioridad alimenta CF y EF | `solver-source.test.js` |
| D3 | Las reglas de conductividad solo se consultaban para el motor Poclain | ✅ **corregida en E2**: todas las reglas se aplican (control de caudal, orificio, secuencia, antirretornos…) | `solver-source.test.js` |
| D4 | Doble modelo de pérdidas (tabla en bar vs multiplicadores del BFS) | ✅ **corregida en E2**: un único modelo, el de la tabla | `solver-source.test.js` |
| D5 | Las tarjetas Cylinder Force / Speed mostraban siempre 0 | ✅ **restaurada en E2**: el solver devuelve `force` y `speed` reales | `solver-source.test.js`, `solver-actuators.test.js` |
| D6 | Se perdió el cambio de unidades métrico/imperial (`UNIT_DEFS`, `convDisp`) | ✅ **restaurada**: selector SI/Imperial en la barra superior; convierte readouts, etiquetas del canvas, panel de propiedades y guía de componentes (recordado en `localStorage`) | `units.test.js`, `component-docs.test.js` |
| D7 | El motor no propaga caudal al puerto de retorno | ⏳ explícito: `physics.noConduction` en `motor`/`motor-bidir`; para corregirlo basta quitarlo | `registry-equivalence.test.js` |
| D8 | El panel de propiedades "avanzado" (`js/modules/*`) es inalcanzable | ⏳ pendiente (E5) | — |

> Al corregir D1–D4 cambian resultados visibles del simulador (era el objetivo acordado):
> p. ej. con bomba de 150 bar y alivio de 120 bar ahora la línea trabaja a 120 bar, y un
> control de caudal de 15 L/min limita realmente el caudal que llega al cilindro.
> Los valores anteriores quedaron fijados en tests de "caracterización" que ahora
> comprueban el comportamiento corregido.

## 4. Cómo validar

```powershell
# 1) Servir la aplicación (los módulos ES necesitan HTTP)
python -m http.server 8123

# 2) Tests del nucleo
powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1
#    → ejecuta tests/index.html en Chrome/Edge headless y escribe _test-report.txt

# 3) Aplicación
#    http://localhost:8123/index.html
```

Verificación manual recomendada tras cada etapa: cargar dos circuitos predefinidos,
ejecutar, comprobar etiquetas de presión/caudal sobre las conexiones, mover un
componente, conectarlo de nuevo, guardar/cargar y exportar/importar JSON.
