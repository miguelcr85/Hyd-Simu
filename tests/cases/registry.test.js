// ================================================================
// TESTS — COMPONENT REGISTRY (ETAPA E2)
// ================================================================
// El registro es el punto unico de extension: estos tests garantizan que
// (a) los 54 componentes del catalogo estan registrados, y
// (b) el contrato ComponentSpec se valida (un componente nuevo mal declarado
//     falla pronto y con un mensaje claro).
// ================================================================

import { describe, it, expect, expectThrow } from '../harness.js';
import { COMP_DEFS, makeComponent } from '../fixtures.js';
import {
  ROLES, registerComponent, getComponent, hasComponent,
  registeredTypes, registrySize, componentsByRole, clearRegistry
} from '../../js/core/registry.js';
import { registerAllComponents } from '../../js/components/index.js';
import { getComponentPassthrough } from '../../js/core/simulation/index.js';

describe('ComponentRegistry — catalogo completo y contrato', function () {

  it('registra exactamente los 54 componentes del catalogo', function () {
    expect(registrySize()).toBe(54);
    expect(registeredTypes().length).toBe(54);
  });

  it('todo tipo del catalogo tiene su spec registrado', function () {
    Object.keys(COMP_DEFS).forEach(function (type) {
      if (!hasComponent(type)) throw new Error('Falta registrar el componente: ' + type);
    });
  });

  it('no sobran componentes registrados fuera del catalogo', function () {
    registeredTypes().forEach(function (type) {
      if (!COMP_DEFS[type]) throw new Error('Registrado pero no esta en el catalogo: ' + type);
    });
  });

  it('cada spec declara un rol valido y una etiqueta', function () {
    const valid = Object.keys(ROLES).map(function (k) { return ROLES[k]; });
    registeredTypes().forEach(function (type) {
      const spec = getComponent(type);
      if (valid.indexOf(spec.role) < 0) throw new Error(type + ': rol invalido ' + spec.role);
      expect(typeof spec.label).toBe('string');
      expect(spec.label.length).toBeGreaterThan(0);
    });
  });

  it('las 9 valvulas direccionales implementan internalRouting()', function () {
    const valves = componentsByRole(ROLES.VALVE_DIRECTIONAL);
    expect(valves.length).toBe(9);
    valves.forEach(function (spec) {
      expect(typeof spec.physics.internalRouting).toBe('function');
    });
  });

  it('los roles agrupan el catalogo como se espera', function () {
    expect(componentsByRole(ROLES.SOURCE).length).toBe(6);
    expect(componentsByRole(ROLES.VALVE_PRESSURE).length).toBe(6);
    expect(componentsByRole(ROLES.VALVE_FLOW).length).toBe(15);
    expect(componentsByRole(ROLES.ACTUATOR_LINEAR).length).toBe(3);
    expect(componentsByRole(ROLES.ACTUATOR_ROTARY).length).toBe(4);
    expect(componentsByRole(ROLES.INSTRUMENT).length).toBe(6);
    expect(componentsByRole(ROLES.CONDITIONER).length).toBe(5);
  });

  it('rechaza un spec sin los campos obligatorios', function () {
    expectThrow(function () { registerComponent({ type: 'foo' }); });
    expectThrow(function () { registerComponent({ type: 'foo', label: 'Foo' }); });
    expectThrow(function () { registerComponent({ type: 'foo', label: 'Foo', role: ROLES.VALVE_FLOW }); });
    expectThrow(function () { registerComponent(null); });
  });

  it('rechaza un rol desconocido', function () {
    expectThrow(function () {
      registerComponent({ type: 'foo', label: 'Foo', role: 'rol-inventado', physics: {} });
    });
  });

  it('rechaza una valvula direccional sin internalRouting()', function () {
    expectThrow(function () {
      registerComponent({ type: 'foo', label: 'Foo', role: ROLES.VALVE_DIRECTIONAL, physics: {} });
    });
  });

  it('rechaza physics.conduct si no es una funcion', function () {
    expectThrow(function () {
      registerComponent({ type: 'foo', label: 'Foo', role: ROLES.VALVE_FLOW, physics: { conduct: 42 } });
    });
  });

  it('rechaza registrar dos veces el mismo tipo', function () {
    expectThrow(function () {
      registerComponent({ type: 'check', label: 'Clon', role: ROLES.VALVE_FLOW, physics: {} });
    });
  });

  it('getComponent() devuelve null para un tipo desconocido (sin romper la simulacion)', function () {
    expect(getComponent('componente-inexistente')).toBeNull();
  });

  it('getComponent() avisa si el registro esta vacio y se puede repoblar', function () {
    const expected = registeredTypes().length;
    clearRegistry();
    try {
      const err = expectThrow(function () { getComponent('check'); });
      expect(String(err.message)).toContain('registro de componentes esta vacio');
    } finally {
      registerAllComponents();
    }
    expect(registeredTypes().length).toBe(expected);
  });

  it('registerAllComponents() es idempotente', function () {
    const before = registrySize();
    registerAllComponents();
    registerAllComponents();
    expect(registrySize()).toBe(before);
  });
});
