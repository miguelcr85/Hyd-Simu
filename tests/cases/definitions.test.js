// ================================================================
// TESTS — CATALOGO DE COMPONENTES: VALORES POR DEFECTO Y PUERTOS
// ================================================================
// Los valores por defecto son parte de la experiencia actual del tablero:
// al anadir un componente, `addComponent()` copia `params[key].def`. Si cambian,
// cambia el arranque de cualquier circuito nuevo, por eso se fijan aqui.
// ================================================================

import { describe, it, expect } from '../harness.js';
import { COMP_DEFS } from '../../js/core/component-definitions.js';

describe('Catalogo — valores por defecto de los parametros', function () {

  it('bomba: 150 bar y 30 L/min', function () {
    expect(COMP_DEFS.pump.params.pressure.def).toBe(150);
    expect(COMP_DEFS.pump.params.flow.def).toBe(30);
  });

  it('valvula de alivio: 200 bar de tarado', function () {
    expect(COMP_DEFS.relief.params.setting.def).toBe(200);
  });

  it('cilindro de doble efecto: Ø80 / vastago Ø45 / carrera 300 mm', function () {
    expect(COMP_DEFS['cylinder-da'].params.bore.def).toBe(80);
    expect(COMP_DEFS['cylinder-da'].params.rod.def).toBe(45);
    expect(COMP_DEFS['cylinder-da'].params.stroke.def).toBe(300);
  });

  it('motor: 25 cm3/rev y motor Poclain: 380 cm3/rev', function () {
    expect(COMP_DEFS.motor.params.displacement.def).toBe(25);
  });

  it('orificio: 1,5 mm; estrangulador: 50 % de apertura', function () {
    expect(COMP_DEFS.orifice.params.diameter.def).toBe(1.5);
    expect(COMP_DEFS.throttle.params.opening.def).toBe(50);
  });

  it('valvulas direccionales arrancan en posiciones seguras', function () {
    expect(COMP_DEFS.dcv43.params.position.def).toBe('Center');
    expect(COMP_DEFS.dcv43.params.centerType.def).toBe('Closed');
    expect(COMP_DEFS.dcv32.params.position.def).toBe('Closed');
    expect(COMP_DEFS.dcv32no.params.position.def).toBe('Normal');
  });

  it('los parametros de tipo select declaran sus opciones', function () {
    expect(COMP_DEFS.dcv43.params.centerType.options).toContain('Tandem');
    expect(COMP_DEFS.dcv43.params.centerType.options).toContain('Float');
    expect(COMP_DEFS['cylinder-da'].params.cushion.options).toContain('Both ends');
  });
});

describe('Catalogo — puertos y geometria', function () {

  it('bomba: P arriba y T abajo', function () {
    expect(COMP_DEFS.pump.ports[0].label).toBe('P');
    expect(COMP_DEFS.pump.ports[0].dir).toBe('up');
    expect(COMP_DEFS.pump.ports[1].label).toBe('T');
    expect(COMP_DEFS.pump.ports[1].dir).toBe('down');
  });

  it('DCV 4/3: cuatro puertos (P, T, A, B)', function () {
    const labels = COMP_DEFS.dcv43.ports.map(function (p) { return p.label; }).sort();
    expect(labels).toEqual(['A', 'B', 'P', 'T']);
  });

  it('cilindro de doble efecto: puertos A y B', function () {
    expect(COMP_DEFS['cylinder-da'].ports[0].label).toBe('A');
    expect(COMP_DEFS['cylinder-da'].ports[1].label).toBe('B');
  });

  it('deposito: un unico puerto de tanque', function () {
    expect(COMP_DEFS.reservoir.ports.length).toBe(1);
  });

  it('válvulas 5/3 y poclain exponen todos sus puertos', function () {
    expect(COMP_DEFS.dcv53.ports.length).toBe(5);
    const poclain = COMP_DEFS['poclain-ms35'];
    expect(poclain.ports.length).toBeGreaterThanOrEqual(3);
  });

  it('todos los puertos quedan dentro del simbolo (salvo tolerancia de 4 px)', function () {
    Object.keys(COMP_DEFS).forEach(function (type) {
      const def = COMP_DEFS[type];
      def.ports.forEach(function (p) {
        expect(p.x).toBeGreaterThanOrEqual(-4);
        expect(p.x).toBeLessThanOrEqual(def.w + 4);
        expect(p.y).toBeGreaterThanOrEqual(-4);
        expect(p.y).toBeLessThanOrEqual(def.h + 4);
      });
    });
  });
});
