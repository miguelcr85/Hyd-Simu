// ================================================================
// REGISTRO DE LOS 54 COMPONENTES DEL SIMULADOR
// ================================================================
//
// Punto de entrada del dominio: registra cada familia de componentes en el
// ComponentRegistry. La interfaz (js/app.js) y los tests llaman una vez a
// `registerAllComponents()` antes de simular.
//
// PARA ANADIR UN COMPONENTE NUEVO (objetivo de la arquitectura):
//   1) crea el objeto ComponentSpec (o agregalo a la familia correspondiente)
//      declarando `type`, `label`, `role` y `physics`;
//   2) anadelo al array de su familia (o a `EXTRA_COMPONENTS`);
//   3) anade su definicion al catalogo (js/core/component-definitions.js) y su
//      entrada de paleta; en E3 la paleta y los simbolos se generaran desde aqui.
// No hay que tocar el solver ni la interfaz grafica.
// ================================================================

import { registerComponent, registrySize } from '../core/registry.js';
import { directionalValves } from './valves-directional.js';
import { flowValves } from './valves-flow.js';
import { distributionValves } from './valves-distribution.js';
import { pressureValves } from './valves-pressure.js';
import { conditioners, instruments } from './conditioning.js';
import { actuators } from './actuators.js';
import { sources } from './sources.js';

/** Componentes que todavia no pertenecen a una familia especifica. */
const EXTRA_COMPONENTS = [];

const FAMILIES = [
  { name: 'valvulas direccionales', specs: directionalValves },
  { name: 'valvulas de caudal', specs: flowValves },
  { name: 'valvulas de reparto', specs: distributionValves },
  { name: 'valvulas de presion', specs: pressureValves },
  { name: 'acondicionamiento', specs: conditioners },
  { name: 'instrumentos', specs: instruments },
  { name: 'actuadores', specs: actuators },
  { name: 'fuentes', specs: sources },
  { name: 'otros', specs: EXTRA_COMPONENTS }
];

let registered = false;

/**
 * Registra todas las familias. Es idempotente: si el registro ya tiene
 * componentes no vuelve a registrar nada (la interfaz y los tests la invocan por
 * separado). Tras clearRegistry() vuelve a poblar el registro.
 */
export function registerAllComponents() {
  if (registrySize() > 0) return registrySize();
  registered = true;
  FAMILIES.forEach(function (family) {
    family.specs.forEach(function (spec) {
      registerComponent(spec);
    });
  });
  return registrySize();
}

/** Numero de componentes que aporta el registro (54 en el catalogo actual). */
export function componentCount() {
  return FAMILIES.reduce(function (total, family) { return total + family.specs.length; }, 0);
}

export { FAMILIES };
