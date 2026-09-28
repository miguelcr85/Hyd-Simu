// ================================================================
// TESTS — PANEL EDUCATIVO: ROBUSTEZ
// ================================================================
// El panel debe aguantar componentes sin documentar, definiciones incompletas,
// formulas que lancen errores y contenido que necesite escapado.
// ================================================================

import { describe, it, expect } from '../harness.js';
import { componentDocsHtml } from '../../js/ui/componentDocs.js';
import { unitHelpers, SYSTEMS } from '../../js/core/units.js';
import { COMP_DEFS, makeComponent } from '../fixtures.js';
import { getComponent } from '../../js/core/registry.js';

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

describe('Panel educativo — robustez', function () {

  it('un componente sin formulas sigue mostrando nombre, puertos y variables', function () {
    const comp = makeComponent('relief', 7, { setting: 200 });
    const html = componentDocsHtml({
      definition: COMP_DEFS.relief,
      spec: { type: 'relief', label: 'Relief Valve', role: 'valve-pressure', physics: {} },
      comp: comp,
      vm: viewModel(comp, SYSTEMS.SI, 150, 20)
    });
    expect(html).toContain('Relief Valve');
    expect(html).toContain('Ports — live values');
    expect(html).toContain('Setting');
    expect(html.length).toBeGreaterThan(200);
  });

  it('escapa el contenido para no romper el HTML', function () {
    const comp = makeComponent('check', 1, {});
    const html = componentDocsHtml({
      definition: { name: '<img src=x onerror=alert(1)>', ports: [], params: {} },
      spec: null,
      comp: comp,
      vm: viewModel(comp, SYSTEMS.SI, 0, 0)
    });
    expect(html.indexOf('<img')).toBe(-1);
    expect(html).toContain('&lt;img');
    expect(html).toContain('not registered');
  });

  it('si una formula lanza un error, el panel lo informa en lugar de romperse', function () {
    const comp = makeComponent('check', 1, {});
    const html = componentDocsHtml({
      definition: COMP_DEFS.check,
      spec: {
        type: 'check', role: 'valve-flow', physics: {},
        equations: function () { throw new Error('boom'); }
      },
      comp: comp,
      vm: viewModel(comp, SYSTEMS.SI, 0, 0)
    });
    expect(html).toContain('Formulas could not be computed');
    expect(html).toContain('boom');
  });

  it('sin componente ni spec no lanza excepciones', function () {
    const html = componentDocsHtml({ definition: {}, spec: null, comp: null, vm: {} });
    expect(html).toContain('edu-head');
    expect(html).toContain('Component');
  });

  it('el registro aporta specs para los 54 componentes seleccionables', function () {
    Object.keys(COMP_DEFS).forEach(function (type) {
      const spec = getComponent(type);
      if (!spec) throw new Error('sin spec registrado: ' + type);
    });
  });
});
