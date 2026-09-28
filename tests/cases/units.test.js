// ================================================================
// TESTS — UNIDADES SI / IMPERIAL (dominio puro)
// ================================================================
// La conversion es solo de presentacion: los factores deben ser los mismos que
// usaba la aplicacion anterior y la ida y vuelta debe ser estable.
// ================================================================

import { describe, it, expect } from '../harness.js';
import {
  SYSTEMS, systemLabel, unitLabel, decimalsFor, convert, toSi,
  formatValue, formatWithUnit, kindFromUnit, isKnownKind, supportedKinds
} from '../../js/core/units.js';

describe('Unidades — etiquetas y decimales', function () {

  it('el sistema SI usa las etiquetas del calculo interno', function () {
    expect(unitLabel('pressure', SYSTEMS.SI)).toBe('bar');
    expect(unitLabel('flow', SYSTEMS.SI)).toBe('L/min');
    expect(unitLabel('force', SYSTEMS.SI)).toBe('kN');
    expect(unitLabel('speed', SYSTEMS.SI)).toBe('mm/s');
  });

  it('el sistema imperial traduce las etiquetas', function () {
    expect(unitLabel('pressure', SYSTEMS.IMPERIAL)).toBe('psi');
    expect(unitLabel('flow', SYSTEMS.IMPERIAL)).toBe('gpm');
    expect(unitLabel('power', SYSTEMS.IMPERIAL)).toBe('hp');
    expect(unitLabel('force', SYSTEMS.IMPERIAL)).toBe('lbf');
    expect(unitLabel('speed', SYSTEMS.IMPERIAL)).toBe('in/s');
    expect(unitLabel('torque', SYSTEMS.IMPERIAL)).toBe('lbf·ft');
  });

  it('rpm y % no cambian de etiqueta', function () {
    expect(unitLabel('rpm', SYSTEMS.IMPERIAL)).toBe('rpm');
    expect(unitLabel('percent', SYSTEMS.IMPERIAL)).toBe('%');
  });

  it('una magnitud desconocida devuelve etiqueta vacia', function () {
    expect(unitLabel('inventada', SYSTEMS.SI)).toBe('');
    expect(isKnownKind('inventada')).toBeFalsy();
    expect(isKnownKind('pressure')).toBeTruthy();
  });

  it('los decimales se ajustan al sistema (psi sin decimales, gpm con 2)', function () {
    expect(decimalsFor('pressure', SYSTEMS.SI)).toBe(1);
    expect(decimalsFor('pressure', SYSTEMS.IMPERIAL)).toBe(0);
    expect(decimalsFor('flow', SYSTEMS.IMPERIAL)).toBe(2);
  });

  it('systemLabel describe los dos sistemas', function () {
    expect(systemLabel(SYSTEMS.SI)).toContain('SI');
    expect(systemLabel(SYSTEMS.IMPERIAL)).toContain('Imperial');
  });
});

describe('Unidades — conversion', function () {

  it('150 bar -> 2176 psi (factor 14,5038)', function () {
    expect(convert('pressure', 150, SYSTEMS.IMPERIAL)).toBeCloseTo(2175.57, 0.01);
  });

  it('30 L/min -> 7,93 gpm', function () {
    expect(convert('flow', 30, SYSTEMS.IMPERIAL)).toBeCloseTo(7.925, 0.001);
  });

  it('10 kW -> 13,41 hp', function () {
    expect(convert('power', 10, SYSTEMS.IMPERIAL)).toBeCloseTo(13.4102, 0.0001);
  });

  it('73,1 kN -> 16.434 lbf', function () {
    expect(convert('force', 73.1, SYSTEMS.IMPERIAL)).toBeCloseTo(16433.5, 0.5);
  });

  it('100 mm/s -> 3,94 in/s', function () {
    expect(convert('speed', 100, SYSTEMS.IMPERIAL)).toBeCloseTo(3.93701, 0.0001);
  });

  it('la temperatura usa escala y desplazamiento (40 C -> 104 F)', function () {
    expect(convert('temperature', 40, SYSTEMS.IMPERIAL)).toBeCloseTo(104, 0.001);
    expect(convert('temperature', 40, SYSTEMS.SI)).toBeCloseTo(40, 0.001);
  });

  it('en SI no hay conversion', function () {
    expect(convert('pressure', 150, SYSTEMS.SI)).toBe(150);
    expect(convert('flow', 30, SYSTEMS.SI)).toBe(30);
  });

  it('la ida y vuelta conserva el valor', function () {
    ['pressure', 'flow', 'power', 'force', 'speed', 'torque', 'length', 'volume', 'displacement', 'temperature'].forEach(function (kind) {
      const imperial = convert(kind, 123.456, SYSTEMS.IMPERIAL);
      const back = toSi(kind, imperial, SYSTEMS.IMPERIAL);
      if (Math.abs(back - 123.456) > 1e-6) {
        throw new Error('ida y vuelta fallida en ' + kind + ': ' + back);
      }
    });
  });

  it('un valor no finito devuelve NaN (se muestra como raya)', function () {
    expect(isFinite(convert('pressure', undefined, SYSTEMS.IMPERIAL))).toBeFalsy();
    expect(formatValue('pressure', NaN, SYSTEMS.SI)).toBe('—');
    expect(formatValue('pressure', undefined, SYSTEMS.IMPERIAL)).toBe('—');
  });

  it('una magnitud desconocida se devuelve sin tocar', function () {
    expect(convert('inventada', 42, SYSTEMS.IMPERIAL)).toBe(42);
  });
});

describe('Unidades — formateo', function () {

  it('formatWithUnit incluye la unidad del sistema', function () {
    expect(formatWithUnit('pressure', 150, SYSTEMS.SI)).toBe('150.0 bar');
    expect(formatWithUnit('pressure', 150, SYSTEMS.IMPERIAL)).toBe('2176 psi');
    expect(formatWithUnit('flow', 30, SYSTEMS.IMPERIAL)).toBe('7.93 gpm');
  });

  it('se pueden pedir decimales concretos', function () {
    expect(formatValue('pressure', 150, SYSTEMS.SI, 0)).toBe('150');
    expect(formatWithUnit('force', 73.136, SYSTEMS.SI, 2)).toBe('73.14 kN');
  });

  it('kindFromUnit deduce la magnitud de la etiqueta', function () {
    expect(kindFromUnit('bar')).toBe('pressure');
    expect(kindFromUnit(' L/min ')).toBe('flow');
    expect(kindFromUnit('kN')).toBe('force');
    expect(kindFromUnit('cm³/rev')).toBe('displacement');
    expect(kindFromUnit('RPM')).toBe('rpm');
    expect(kindFromUnit('widgets')).toBeNull();
    expect(kindFromUnit('')).toBeNull();
  });

  it('todas las magnitudes conocidas se pueden etiquetar y formatear', function () {
    supportedKinds().forEach(function (kind) {
      expect(typeof unitLabel(kind, SYSTEMS.SI)).toBe('string');
      expect(typeof unitLabel(kind, SYSTEMS.IMPERIAL)).toBe('string');
      const text = formatWithUnit(kind, 12.3456, SYSTEMS.IMPERIAL);
      expect(text.length).toBeGreaterThan(0);
    });
  });
});
