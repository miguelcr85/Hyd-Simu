// ================================================================
// COMPONENT REGISTRY — punto unico de extension del simulador
// ================================================================
//
// Objetivo (etapa E2): anadir un componente hidraulico debe ser
// "1 archivo + 1 registro", sin tocar el solver ni la interfaz.
//
// Cada componente se describe con un `ComponentSpec`:
//
//   {
//     type: 'cylinder-da',            // clave del catalogo (COMP_DEFS)
//     label: 'Double-Acting Cylinder',
//     role: 'actuator-linear',        // ver ROLES
//     physics: {
//       internalRouting(comp)  -> [{from,to}] | null   (valvulas direccionales)
//       conduct(comp, portIdx, pressure, flow)
//                              -> { canFlow, outPort, pressureDrop, flowLimit }
//       solve(comp, ctx)       -> { ... }              (actuadores/instrumentos)
//       dynamics(comp, dt)     -> void                 (movimiento)
//     }
//   }
//
// El rol es el que decide COMO participa el componente en el BFS, de modo que
// el solver deja de tener cadenas de `if (comp.type === '...')`.
// ================================================================

/** Roles disponibles (el solver los interpreta). */
export const ROLES = {
  SOURCE: 'source',
  VALVE_DIRECTIONAL: 'valve-directional',
  VALVE_PRESSURE: 'valve-pressure',
  VALVE_FLOW: 'valve-flow',
  ACTUATOR_LINEAR: 'actuator-linear',
  ACTUATOR_ROTARY: 'actuator-rotary',
  INSTRUMENT: 'instrument',
  CONDITIONER: 'conditioner'
};

const ROLE_VALUES = Object.keys(ROLES).map(function (k) { return ROLES[k]; });

const REQUIRED_FIELDS = ['type', 'label', 'role', 'physics'];

const specs = new Map();

/**
 * Registra un ComponentSpec. Falla pronto (con mensaje claro) si el contrato no
 * se cumple, de modo que un componente nuevo mal declarado no rompa la simulacion.
 */
export function registerComponent(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('ComponentSpec invalido: se esperaba un objeto');
  }
  for (let i = 0; i < REQUIRED_FIELDS.length; i++) {
    const field = REQUIRED_FIELDS[i];
    if (spec[field] === undefined) {
      throw new Error('ComponentSpec "' + (spec.type || '?') + '": falta el campo "' + field + '"');
    }
  }
  if (ROLE_VALUES.indexOf(spec.role) < 0) {
    throw new Error('ComponentSpec "' + spec.type + '": rol desconocido "' + spec.role +
      '" (validos: ' + ROLE_VALUES.join(', ') + ')');
  }
  if (typeof spec.physics !== 'object') {
    throw new Error('ComponentSpec "' + spec.type + '": "physics" debe ser un objeto');
  }
  ['internalRouting', 'conduct', 'solve', 'dynamics'].forEach(function (fn) {
    if (spec.physics[fn] !== undefined && typeof spec.physics[fn] !== 'function') {
      throw new Error('ComponentSpec "' + spec.type + '": physics.' + fn + ' debe ser una funcion');
    }
  });
  if (spec.physics.noConduction !== undefined && typeof spec.physics.noConduction !== 'boolean') {
    throw new Error('ComponentSpec "' + spec.type + '": physics.noConduction debe ser booleano');
  }
  if (spec.role === ROLES.VALVE_DIRECTIONAL && typeof spec.physics.internalRouting !== 'function') {
    throw new Error('ComponentSpec "' + spec.type + '": una valvula direccional debe implementar physics.internalRouting()');
  }
  if (specs.has(spec.type)) {
    throw new Error('El componente "' + spec.type + '" ya esta registrado');
  }
  specs.set(spec.type, spec);
  return spec;
}

/**
 * Devuelve el spec registrado para un tipo, o null si el tipo no esta en el
 * catalogo registrado (el solver debe tolerarlo). Si el registro esta vacio
 * avisa en lugar de provocar un fallo silencioso de simulacion.
 */
export function getComponent(type) {
  const spec = specs.get(type);
  if (spec) return spec;
  if (specs.size === 0) {
    throw new Error('El registro de componentes esta vacio: llama a registerAllComponents() ' +
      '(js/components/index.js) antes de simular');
  }
  return null;
}

/** true si el tipo esta registrado. */
export function hasComponent(type) {
  return specs.has(type);
}

/** Tipos registrados, ordenados alfabeticamente. */
export function registeredTypes() {
  return Array.from(specs.keys()).sort();
}

/** Numero de componentes registrados. */
export function registrySize() {
  return specs.size;
}

/** Specs de un rol (p. ej. todas las valvulas de presion). */
export function componentsByRole(role) {
  return registeredTypes()
    .map(function (t) { return specs.get(t); })
    .filter(function (s) { return s.role === role; });
}

/** Vacia el registro (util en tests). */
export function clearRegistry() {
  specs.clear();
}
