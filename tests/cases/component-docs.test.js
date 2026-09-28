// ================================================================
// TESTS — PANEL EDUCATIVO (constructor de HTML)
// ================================================================
// `componentDocsHtml()` es puro: recibe definicion, spec, componente y view-model
// y devuelve una cadena. Se prueba sin navegador verificando que aparece la
// descripcion, las formulas, los puertos y las variables con su valor actual, y
// que los valores respetan el sistema de unidades activo.
// ================================================================

import { describe, it, expect } from '../harness.js';
import { componentDocsHtml } from '../../js/ui/componentDocs.js';
import { unitHelpers, SYSTEMS } from '../../js/core/units.js';
import { COMP_DEFS, makeComponent } from '../fixtures.js';
import { getComponent } from '../../js/core/registry.js';

/** View-model minimo, como el que construye la interfaz al seleccionar. */
function viewModel(comp, system, pressure, flow) {
  const vm = unitHelpers(system);
  vm.running = true;
  vm.comp = comp;
  vm.pressure = pressure;
  vm.flow = flow;
  vm.ports = (COMP_DEFS[comp.type].ports || []).map(function (port, idx) {
    return { idx: idx, label: port.label, portRole: 'fluid', pressure: pressure, flow: flow, connCount: 1 };
  });
  return vm;
}

function cylinderHtml(system, pressure, flow, values) {
  const comp = makeComponent('cylinder-da', 1, values || { bore: 80, rod: 45, stroke: 300 });
  return componentDocsHtml({
    definition: COMP_DEFS['cylinder-da'],
    spec: getComponent('cylinder-da'),
    comp: comp,
    vm: viewModel(comp, system, pressure, flow)
  });
}

describe('Panel educativo — cilindro de doble efecto', function () {

  it('muestra la descripcion y la formula de fuerza F = P × A', function () {
    const html = cylinderHtml(SYSTEMS.SI, 145.5, 29.7);
    expect(html).toContain('F = P × A');
    expect(html).toContain('Double-acting cylinder');
    expect(html).toContain('Design formulas');
    expect(html).toContain('edu-eq-result');
  });

  it('sustituye los valores reales y muestra el resultado en SI', function () {
    const html = cylinderHtml(SYSTEMS.SI, 145.5, 29.7);
    expect(html).toContain('145.5');
    expect(html).toContain('73.1 kN');       /* F = 145,5 x 5026,5 x 0,1 / 1000 */
    expect(html).toContain('bar');
  });

  it('en sistema imperial convierte valores y unidades', function () {
    const html = cylinderHtml(SYSTEMS.IMPERIAL, 145.5, 29.7);
    expect(html).toContain('lbf');
    expect(html).toContain('psi');
    expect(html).toContain('Imperial (US)');
    expect(html.indexOf('73.1 kN')).toBe(-1);
  });

  it('lista los puertos con sus valores en vivo', function () {
    const html = cylinderHtml(SYSTEMS.SI, 120, 25);
    expect(html).toContain('Ports — live values');
    expect(html).toContain('edu-port');
    expect(html).toContain('120.0 bar');
  });

  it('muestra las variables con su valor actual y su unidad', function () {
    const html = cylinderHtml(SYSTEMS.SI, 0, 0);
    expect(html).toContain('Variables');
    expect(html).toContain('Bore');
    expect(html).toContain('80.0 mm');
  });

  it('sin simulacion avisa de que no hay valores medidos', function () {
    const comp = makeComponent('cylinder-da', 1, {});
    const vm = viewModel(comp, SYSTEMS.SI, 0, 0);
    vm.running = false;
    const html = componentDocsHtml({
      definition: COMP_DEFS['cylinder-da'],
      spec: getComponent('cylinder-da'),
      comp: comp,
      vm: vm
    });
    expect(html).toContain('stopped');
    expect(html).toContain('Press Run to see measured values.');
  });

  it('todas las formulas devueltas tienen titulo y formula', function () {
    const spec = getComponent('cylinder-da');
    const comp = makeComponent('cylinder-da', 1, { bore: 80, rod: 45 });
    const list = spec.equations(viewModel(comp, SYSTEMS.SI, 150, 30));
    expect(list.length).toBeGreaterThan(2);
    list.forEach(function (eq) {
      if (!eq.title || !eq.formula) throw new Error('formula incompleta: ' + JSON.stringify(eq));
    });
  });
});
