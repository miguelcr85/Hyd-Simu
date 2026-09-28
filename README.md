# Hydraulic Circuit Simulator & Trainer

An interactive, browser-based simulator for hydraulic circuits, aimed at forest machinery
(harvesters, forwarders, loaders): drag ISO 1219 symbols onto a canvas, connect them, run the
circuit and watch pressure and flow live — with a built-in **component guide that explains the
design formulas** behind every element, and a **SI / Imperial unit switch**.

No build step, no dependencies, no framework: plain ES modules, HTML canvas and CSS.

| | |
|---|---|
| **Stack** | Vanilla JavaScript (ES modules), HTML5 canvas, CSS |
| **Runtime deps** | None |
| **Build step** | None (static files) |
| **Components** | 54 hydraulic elements, 9 palette categories |
| **Modes** | Simulate · Explore · Practice · Quiz |
| **Units** | International (SI) and Imperial (US), switchable at runtime |
| **Tests** | 337 automated assertions, run in a headless browser (no Node required) |

---

## Table of contents

1. [Quick start](#quick-start)
2. [What you can do](#what-you-can-do)
3. [Building a circuit](#building-a-circuit)
4. [Component catalog](#component-catalog)
5. [Architecture](#architecture)
6. [Adding a new component](#adding-a-new-component)
7. [Simulation model](#simulation-model)
8. [Units](#units)
9. [Testing and validation](#testing-and-validation)
10. [Repository layout](#repository-layout)
11. [Project status and known limitations](#project-status-and-known-limitations)
12. [Documentation and license](#documentation-and-license)

---

## Quick start

The application uses ES modules, so it must be served over HTTP (opening the file directly
with `file://` will not work).

```bash
# from the project root — any static server works
python -m http.server 8123
# then open http://localhost:8123/index.html
```

Alternatives: the VS Code **Live Server** extension, `npx serve`, `php -S localhost:8123`,
IIS, nginx, or any static hosting (GitHub Pages, Netlify…).

**Requirements:** a modern browser (Chrome, Edge, Firefox or Safari, desktop or tablet).
The test suite additionally uses Python (for the local server) and Chrome or Edge (headless),
but the application itself has no tooling requirements.

---

## What you can do

### Simulate
Build a circuit on the canvas, press **Run** and observe:

- animated oil flow (particles) with direction taken from the solver,
- line colour by pressure (grey = idle, blue = low, red = above 10 bar),
- **live labels `P bar` / `Q L/min` on every connection** with the flow direction arrow
  (the 🏷️ button hides them),
- readout cards: system pressure, flow, hydraulic power, cylinder force, cylinder speed, status,
- **10 pre-built circuits** to study standard solutions: Meter-In, Meter-Out, Regenerative,
  Sequence, Bleed-Off, Counterbalance, Safety, Priority, Sync Cylinders, Precision Speed.

### Component guide (educational panel)
Select any component and a guide appears **under the canvas** showing:

- what it is and how it works, plus its ISO 1219 symbol conventions,
- its ports with the **live pressure and flow** of each one,
- its variables with the current value and unit,
- the **design formulas of that element**, with the general expression, the substitution of the
  measured values and the result — for example, for a cylinder:

  ```
  Extend force — F = P × A
  F = P × A × 0.1 / 1000
  P in bar · A in mm² (A = π/4 · bore²) · F in kN, because 1 bar = 0.1 N/mm²
  F = 145.5 × 5026 × 0.1 / 1000
  = 73.1 kN
  ```

- measured values (force, piston speed, torque, rpm, instrument readings) and practical notes.

### Units (SI / Imperial)
The **Units** pills in the top bar switch the whole display between International (bar, L/min,
kW, kN, mm/s, Nm, °C, cm³/rev) and Imperial (psi, gpm, hp, lbf, in/s, lbf·ft, °F, in³/rev).
The preference is remembered in `localStorage`. All internal mathematics stays in SI — the switch
only converts what is shown: readouts, canvas labels, symbol readings, property panel and guide.

### Explore / Practice / Quiz
Didactic modes bundled with the simulator: 16 concept cards with formulas and worked examples,
12 generated practice problems with step-by-step solutions, and a 15-question quiz.

### Instrumentation
Fault injection (pump failure, leaks, clogged filter, overheat, stuck relief, cavitation, air
ingress), circuit diagnostics and a 4-channel oscilloscope with CSV and PNG export.

### Persistence
Undo/redo, multi-slot save to `localStorage`, and JSON export/import of the whole circuit.

---

## Building a circuit

1. **Add** — click a palette item, or drag it onto the canvas.
2. **Move** — drag the component; the routing of its connections follows automatically.
3. **Connect** — click a port (the small circle) and then the target port. Orthogonal routing with
   waypoint support; drag a segment to reshape it, right-click a connection to reset it to auto-route.
4. **Configure** — select the component; the **Component Properties** panel shows sliders and
   drop-downs for its parameters (bore, relief setting, valve position…) and the live data block.
5. **Run** — press **Run** and watch flow, pressure and the component guide update. Press **Stop**
   to reset the actuators.

### Keyboard and mouse shortcuts

| Key | Action |
|---|---|
| `R` | Rotate the selected component 90° |
| `D` | Duplicate the selected component |
| `Delete` / `Backspace` | Delete the selection |
| `H` | Toggle pan mode |
| `Ctrl` + `+` / `-` | Zoom in / out |
| `Ctrl` + `0` | Reset the view |
| `Ctrl` + `1` | Fit the whole circuit |
| `Ctrl` + `Z` / `Ctrl` + `Shift` + `Z` | Undo / redo |
| `Esc` | Cancel the current action |
| Right-click | Context menu (info, duplicate, rotate, delete) |

---

## Component catalog

54 elements, grouped in the palette exactly as in the ISO world of hydraulic draughting:

| Palette category | Items | Elements |
|---|---|---|
| Supply & reservoir | 9 | Fixed pump, variable pump, variable-displacement pump, hand pump, engine, pump drive, reservoir, accumulator, intensifier |
| Oil conditioning | 3 | Filter, cooler, heater |
| Directional valves | 9 | DCV 4/3, 4/2, 3/2, 3/2 NO, 5/2, 5/3, 2/2, 2/2 NO, proportional 4/3 |
| Flow valves | 6 | Flow control, pressure-compensated flow control, proportional flow control, throttle, orifice, flow-control + check |
| Pressure & distribution | 8 | Relief, proportional relief, pressure reducing, sequence, counterbalance, unloading, priority, flow divider |
| Logic | 5 | Check, spring check, pilot check, shuttle (OR), AND |
| Actuators | 7 | Cylinders (single/double acting, telescopic), motors (standard, bi-directional, Poclain MS35 LSHT), rotary actuator |
| Measurement | 6 | Pressure gauge, flow meter, temperature gauge, pressure switch, pressure transducer, hydraulic limit switch |
| Utility | 1 | Tee (T-connector) |

Internally the catalog is organised in **8 registry families** (`js/components/*.js`), which is a
different (technical) grouping: sources, valves-directional, valves-flow, valves-distribution,
valves-pressure, conditioning (conditioners + instruments) and actuators.

---

## Architecture

Three layers with a strict dependency direction — UI → registry → simulation → units — and no
component-specific logic in the interface or in the solver:

```
        ┌──────────────────────────────────────────────────────────────┐
        │  UI  (js/app.js, js/ui/*, index.html, css)                   │
        │  canvas, palette, panels, units switch, component guide      │
        └───────────────┬──────────────────────────────────────────────┘
                        │ uses
        ┌───────────────▼──────────────────────────────────────────────┐
        │  ComponentRegistry (js/core/registry.js)                     │
        │  type → ComponentSpec { type, label, role, physics, docs,    │
        │                         equations }                          │
        └───────┬───────────────────────────────────┬──────────────────┘
                │ specs                             │ physics
   ┌────────────▼─────────────┐        ┌────────────▼──────────────────┐
   │ js/components/*.js       │        │ js/core/simulation/*          │
   │ 8 families, 54 specs     │        │ solver, graph, passthrough,   │
   │ (behaviour + documentation)│      │ valve routing, DCV positions  │
   └──────────────────────────┘        └────────────┬──────────────────┘
                                                    │ pure maths
                                        ┌───────────▼──────────────────┐
                                        │ js/core/units.js             │
                                        │ SI ⇄ Imperial (display only) │
                                        └──────────────────────────────┘
```

Key design rules:

- **`js/core/**` is pure domain**: no DOM, no `window`, no `localStorage`. Enforced by tests
  (`tests/cases/architecture.test.js` fetches every core module and asserts it).
- **The solver never asks `comp.type`**: it asks the registry for the spec and dispatches by
  `spec.role` (source, valve-directional, valve-pressure, valve-flow, actuator-linear,
  actuator-rotary, instrument, conditioner) and by `spec.physics`
  (`internalRouting`, `conduct`, `solve`, `noConduction`).
- **One loss model**: each component declares its own pressure drop / flow limit; there are no
  ad-hoc multipliers spread over the solver.
- **Documentation lives with the component**: `spec.docs` and `spec.equations(vm)` are part of the
  spec, so a new element is documented by construction (a test fails if one is missing).
- **Testability**: the whole engine runs without a browser. `tests/node-example.mjs` is a runnable
  example (needs Node) that imports the core and prints the results of a pump → DCV → cylinder circuit.

---

## Adding a new component

Adding an element means **one spec + one registry entry** (plus its palette entry and symbol while
the pending E3 stage is not implemented). The solver, the panels and the unit conversion pick it up
automatically.

```js
// 1) js/components/valves-flow.js — the behaviour and the documentation of the new element
function myValve(comp, port, pressure, flow) {
  if (port === 0) {
    const limit = Math.min(flow, comp.values.flow || 20);
    return { canFlow: true, outPort: 1, pressureDrop: (flow - limit) * 0.5, flowLimit: limit };
  }
  return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
}

// 2) add it to the family array
{
  type: 'my-valve', label: 'My Flow Valve', role: ROLES.VALVE_FLOW,
  docs: flowValveDocs({                       // shown in the component guide
    summary: 'One line: what it is.',
    how: 'A paragraph: how it works and where it is used.',
    standard: 'ISO 1219 symbol description.'
  }),
  equations: function (vm) {                  // shown as "Design formulas"
    return [{
      title: 'Metered flow',
      formula: 'Q_out = min(Q_in, Q_set)',
      where: 'Q in L/min',
      substitution: 'Q_out = min(' + vm.fmt('flow', vm.flow) + ', ' + vm.fmtU('flow', 20) + ')',
      result: vm.fmtU('flow', Math.min(vm.flow || 0, 20))
    }];
  },
  physics: { conduct: myValve }
}
```

3. **Definition** — add the type to `js/core/component-definitions.js` (name, size, ports with
   `x/y/dir/label`, and its parameters with `min/max/step/def`).
4. **Palette and symbol** — add a `data-type="my-valve"` item in `index.html` and a `case` in the
   symbol switch of `renderComponent` plus its palette icon (`js/app.js`). This manual step
   disappears in stage **E3**, where palette and symbols will be generated from the registry.

Then run the test suite: the coverage test (`docs-coverage.test.js`) will verify that the new
component is documented and that the guide renders it in both unit systems, and the smoke test will
run it through the solver.

### The `ComponentSpec` contract

| Field | Purpose |
|---|---|
| `type` | Catalog key (must exist in `component-definitions.js`) |
| `label` | Human-readable name |
| `role` | How the solver treats it: `source`, `valve-directional`, `valve-pressure`, `valve-flow`, `actuator-linear`, `actuator-rotary`, `instrument`, `conditioner` |
| `drop` | (Directional valves) pressure/flow factors applied while the spool is open |
| `physics.internalRouting(comp)` | `[{from, to}]`, `[]` when blocked, `null` if not a directional valve |
| `physics.conduct(comp, port, p, q)` | `{canFlow, outPort, pressureDrop, flowLimit}` — `outPort: -2` means “split between the other ports”; an optional `extra: [{outPort, flowLimit}]` declares additional outlets |
| `physics.solve(comp, ctx)` | Computes loads and readings (cylinder force/speed, motor torque/rpm, instrument reading) |
| `physics.noConduction` | The component does not pass flow (e.g. motors in the current model) |
| `physics.losses` | `{pressure, flow}` factors for two-port components without a `conduct` rule |
| `docs` | Guide content: `summary`, `how`, `standard`, `inputs`, `outputs`, `variables`, `tips`, `instrument` |
| `equations(vm)` | Formulas shown in the guide, evaluated against the live view model |

---

## Simulation model

The engine is a **breadth-first propagation of pressure and flow** over the port graph, run once at
`Run` and then on every animation frame:

1. Build the adjacency map `"compId:portIdx" → connections`.
2. Reset the simulation state of every component and connection.
3. Solve the sources: `engine` (mechanical power), `pump-drive` (power and speed sharing between its
   outputs) and the pumps (fixed and variable displacement).
4. Compute the **system pressure** as `min(pump pressure, lowest relief setting)` and seed the queue
   with it.
5. Walk the queue; for each node ask the component spec:
   - a **directional valve** propagates through its internal routing (3 % pressure / 1 % flow loss),
   - a component with a **`conduct` rule** applies its pressure drop and flow limit (and splits, for
     tees and flow dividers),
   - an **actuator** computes its load (cylinder force and speed, motor torque and rpm),
   - an **instrument** updates its reading,
   - anything else propagates through its two ports with the declared losses.
6. Close the frame with the readouts, the force/speed summary and the instrumentation.

Physics are deliberately didactic but coherent: one loss model, real textbook formulas in the guide,
and deterministic results (a test asserts that two runs give the same numbers).

**Units:** the solver works in bar, L/min, mm, mm², kW, kN, Nm, rpm and °C. Conversion to
Imperial happens only in the presentation layer (`js/core/units.js`).

---

## Units

| Quantity | SI | Imperial | Factor |
|---|---|---|---|
| Pressure | bar | psi | 14.5038 |
| Flow | L/min | gpm | 0.264172 |
| Power | kW | hp | 1.34102 |
| Force | kN | lbf | 224.809 |
| Speed (actuator) | mm/s | in/s | 0.0393701 |
| Torque | Nm | lbf·ft | 0.737562 |
| Length | mm | in | 0.0393701 |
| Volume | L | gal | 0.264172 |
| Displacement | cm³/rev | in³/rev | 0.0610237 |
| Temperature | °C | °F | ×1.8 + 32 |
| Machine speed | km/h | mph | 0.621371 |

The switch (top bar) also changes the number of decimals shown per quantity, and the choice is stored
in `localStorage['hydsim.units']`.

---

## Testing and validation

Everything runs in a real browser, **no Node.js or package manager needed**.

```powershell
# 337 assertions: engine, registry, units, guide, architecture, catalog smoke test
powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1

# same suite plus a smoke check of the real application page (console must stay clean)
powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1 -Page index.html

# verifies that the extracted core still matches the pre-refactor monolith
powershell -ExecutionPolicy Bypass -File tools\e1-verify-extraction.ps1
```

The scripts start `python -m http.server 8123`, run Chrome or Edge headless, and write a readable
report (`_test-report.txt`, `_verify-report.txt`). You can also open
`http://localhost:8123/tests/index.html` in a normal browser to see the test page with the full list
of suites and failures.

What the suite protects:

- **Physics**: pump/relief, unified losses, DCV routing, cylinder force and speed, motor torque and
  rpm, LSHT Poclain, restrictions, splitters, priority valve, sequence valve, check valves.
- **Catalog**: 54 components, ports and parameter defaults, all types run through the solver without
  throwing (smoke test), the palette and the catalog stay in sync.
- **Rule equivalence**: every component's `conduct` and `internalRouting` results are compared
  against a frozen copy of the pre-refactor engine (`tests/legacy/*`) over a matrix of states,
  pressures and flows.
- **Documentation**: all 54 components have a description and formulas, and the guide renders in both
  unit systems without `undefined` or `NaN`.
- **Architecture**: no core module touches the DOM, and the interface cannot re-absorb the engine.

---

## Repository layout

```
index.html                    Application shell: palette, canvas, panels, component guide, units
css/styles.css                All styling (dark theme, responsive, fullscreen mode)

js/app.js                     UI layer: canvas drawing, interaction, panels, units, persistence
js/ui/componentDocs.js        Component guide builder (pure function → testable HTML)
js/core/units.js              SI ⇄ Imperial conversion (pure domain)
js/core/registry.js           ComponentRegistry + ComponentSpec validation
js/core/component-definitions.js   Catalog data: name, size, ports, parameters (54 types)
js/core/simulation/solver.js  BFS engine: sources, propagation, loads, result
js/core/simulation/graph.js   Port adjacency
js/core/simulation/valve-routing.js    Delegates directional-valve routing to the registry
js/core/simulation/passthrough.js      Conductivity entry point (routing → conduct → fallback)
js/core/simulation/dcv-positions.js    Spool position from an external command
js/components/*.js            The 54 specs, grouped in 8 families (behaviour + docs + formulas)

tests/index.html              Test runner page
tests/harness.js              Tiny zero-dependency test framework (describe/it/expect)
tests/fixtures.js             Circuit builder for tests (uses the real catalog and solver)
tests/cases/*.test.js         The 15 test files (337 assertions, 26 suites)
tests/legacy/*                Frozen copy of the pre-refactor rules, used for equivalence tests
tests/node-example.mjs        Optional: run the core from Node

tools/run-tests.ps1           Headless browser test runner + readable report
tools/e1-verify-extraction.ps1        Core-vs-monolith equivalence check
tools/e1-extract-core.ps1     The script that performed the core extraction (with assertions)

docs/ARCHITECTURE.md          Layers, problems found, target architecture, migration stages (ES)
docs/BASELINE.md              Behaviour baseline: formulas, invariants and known deviations (ES)
_legacy/                      Backups taken before each refactoring stage
```

---

## Project status and known limitations

The codebase is being refactored progressively (strangler pattern), keeping behaviour stable and
verifying every step with tests and headless checks:

| Stage | Content | State |
|---|---|---|
| E0 | Freeze behaviour, write documentation, clean debug leftovers | done |
| E1 | Extract the engine into a pure core (`js/core/**`) with 1:1 equivalence + test suite | done |
| E2 | `ComponentRegistry` + specs per family, role-driven solver, unified loss model | done |
| E4 | Component guide (descriptions + formulas) and SI/Imperial units | done |
| E3 | Generate palette and symbols from the registry (remove the 54-case symbol switch) | pending |
| E5 | Remove the dead "advanced" panel (`js/modules/*`, ~600 lines) and its duplicated init, merge duplicated helpers, extend JSDoc | pending |

Behaviours that are deliberately *not* modelled yet (documented and pinned by tests, in
`docs/BASELINE.md` §3):

- **Motors do not pass flow to their return port** (`physics.noConduction` on `motor`/`motor-bidir`).
  Removing that flag is all it takes to enable it.
- The simulator solves a **steady state**, not a time-domain pressure/flow simulation: no
  compressibility, no line dynamics, no thermal model.
- Loss coefficients are engineering approximations (3 % across a directional valve, fixed drops for
  filters and coolers) intended for training, not for sizing a real machine.

---

## Documentation and license

- `docs/ARCHITECTURE.md` — layers, the problems found, the target architecture and the migration
  stages (written in Spanish).
- `docs/BASELINE.md` — behavioural baseline: constants, formulas, invariants, the list of deviations
  (D1…D8) and how to validate a change.
- The component guide inside the application **is** the user documentation for the physics of every
  element.

The project is a static site: deploy the repository as-is to any static host. No environment
variables, no server-side code, no tracking beyond the ad snippet present in `index.html`
(remove it if you deploy your own copy).

**License:** no license file is included in this repository. Add one (`LICENSE`) before distributing,
publishing or reusing the code, and check the third-party fonts/assets if you add any.
