// ================================================================
// UNIDADES Y CONVERSION (dominio puro, sin DOM)
// ================================================================
//
// Todo el calculo interno del simulador trabaja en SI (bar, L/min, mm, kW,
// kN, mm/s, Nm). Este modulo es SOLO de presentacion: convierte los valores
// medidos al sistema que el usuario elija (SI o Imperial) y da la etiqueta y
// el numero de decimales adecuados a cada magnitud.
//
//   convert(kind, valor, 'imp')  -> valor en unidades imperiales
//   formatWithUnit(kind, valor, system)
//
// Factores: los mismos que usaba la aplicacion anterior (app_original.js) para
// no cambiar la experiencia: 1 bar = 14,5038 psi · 1 L/min = 0,264172 gpm ·
// 1 kW = 1,34102 hp · 1 kN = 224,809 lbf · 1 mm/s = 0,0393701 in/s.
// ================================================================

/** Sistemas de visualizacion disponibles. */
export const SYSTEMS = {
  SI: 'si',
  IMPERIAL: 'imp'
};

/** Etiqueta legible del sistema (para la interfaz). */
export function systemLabel(system) {
  return system === SYSTEMS.IMPERIAL ? 'Imperial (US)' : 'International (SI)';
}

const DEFS = {
  pressure:     { si: { label: 'bar',     decimals: 1 }, imp: { label: 'psi',     decimals: 0 }, factor: 14.5038 },
  flow:         { si: { label: 'L/min',   decimals: 1 }, imp: { label: 'gpm',     decimals: 2 }, factor: 0.264172 },
  power:        { si: { label: 'kW',      decimals: 2 }, imp: { label: 'hp',      decimals: 2 }, factor: 1.34102 },
  force:        { si: { label: 'kN',      decimals: 1 }, imp: { label: 'lbf',     decimals: 0 }, factor: 224.809 },
  speed:        { si: { label: 'mm/s',    decimals: 1 }, imp: { label: 'in/s',    decimals: 2 }, factor: 0.0393701 },
  speedKmh:     { si: { label: 'km/h',    decimals: 1 }, imp: { label: 'mph',     decimals: 1 }, factor: 0.621371 },
  torque:       { si: { label: 'Nm',      decimals: 1 }, imp: { label: 'lbf·ft',  decimals: 1 }, factor: 0.737562 },
  length:       { si: { label: 'mm',      decimals: 0 }, imp: { label: 'in',      decimals: 2 }, factor: 0.0393701 },
  volume:       { si: { label: 'L',       decimals: 1 }, imp: { label: 'gal',     decimals: 2 }, factor: 0.264172 },
  displacement: { si: { label: 'cm³/rev', decimals: 1 }, imp: { label: 'in³/rev', decimals: 2 }, factor: 0.0610237 },
  temperature:  { si: { label: '°C',      decimals: 0 }, imp: { label: '°F',      decimals: 0 } },
  /* Magnitudes sin conversion (adimensionales o que no se convierten) */
  rpm:          { si: { label: 'rpm',     decimals: 0 }, imp: { label: 'rpm',     decimals: 0 }, factor: 1 },
  percent:      { si: { label: '%',       decimals: 0 }, imp: { label: '%',       decimals: 0 }, factor: 1 },
  ratio:        { si: { label: '',        decimals: 2 }, imp: { label: '',        decimals: 2 }, factor: 1 }
};

/** true si la magnitud esta soportada. */
export function isKnownKind(kind) {
  return Object.prototype.hasOwnProperty.call(DEFS, kind);
}

/** Etiqueta de la unidad ('bar' o 'psi' segun el sistema). */
export function unitLabel(kind, system) {
  const def = DEFS[kind];
  if (!def) return '';
  const entry = (system === SYSTEMS.IMPERIAL) ? def.imp : def.si;
  return entry.label;
}

/** Decimales recomendados para esa magnitud y sistema. */
export function decimalsFor(kind, system) {
  const def = DEFS[kind];
  if (!def) return 1;
  const entry = (system === SYSTEMS.IMPERIAL) ? def.imp : def.si;
  return entry.decimals;
}

/** Lista de magnitudes soportadas (para documentacion y tests). */
export function supportedKinds() {
  return Object.keys(DEFS).sort();
}

/**
 * Convierte un valor de SI al sistema pedido. Las magnitudes no convertibles
 * (rpm, %, relaciones) se devuelven tal cual.
 */
export function convert(kind, value, system) {
  if (typeof value !== 'number' || !isFinite(value)) return NaN;
  const def = DEFS[kind];
  if (!def) return value;
  if (system !== SYSTEMS.IMPERIAL) return value;
  if (kind === 'temperature') return value * 1.8 + 32;
  return value * def.factor;
}

/** Conversion inversa (para tests y para interpretar entradas del usuario). */
export function toSi(kind, value, system) {
  if (typeof value !== 'number' || !isFinite(value)) return NaN;
  const def = DEFS[kind];
  if (!def) return value;
  if (system !== SYSTEMS.IMPERIAL) return value;
  if (kind === 'temperature') return (value - 32) / 1.8;
  return value / def.factor;
}

/** Numero formateado sin unidad ('—' si no es un valor finito). */
export function formatValue(kind, value, system, decimals) {
  const v = convert(kind, value, system);
  if (!isFinite(v)) return '—';
  const d = (decimals === undefined) ? decimalsFor(kind, system) : decimals;
  return v.toFixed(d);
}

/** Numero + unidad listos para mostrar ('145.5 bar' / '2110 psi'). */
export function formatWithUnit(kind, value, system, decimals) {
  const label = unitLabel(kind, system);
  const text = formatValue(kind, value, system, decimals);
  return label ? (text + ' ' + label) : text;
}

/* ------------------------------------------------------------------
 * Utilidad inversa: deducir la magnitud a partir de la etiqueta de unidad.
 * Permite convertir automaticamente los paneles que ya declaran su unidad
 * (p. ej. las metricas del panel de propiedades) sin modificarlos.
 * ------------------------------------------------------------------ */
const KIND_BY_UNIT = {
  'bar': 'pressure',
  'psi': 'pressure',
  'L/min': 'flow',
  'gpm': 'flow',
  'kW': 'power',
  'hp': 'power',
  'kN': 'force',
  'lbf': 'force',
  'mm/s': 'speed',
  'in/s': 'speed',
  'km/h': 'speedKmh',
  'mph': 'speedKmh',
  'Nm': 'torque',
  'lbf·ft': 'torque',
  'mm': 'length',
  'in': 'length',
  'cm³/rev': 'displacement',
  'in³/rev': 'displacement',
  'L': 'volume',
  'gal': 'volume',
  '°C': 'temperature',
  '°F': 'temperature',
  'rpm': 'rpm',
  'RPM': 'rpm',
  '%': 'percent'
};

/** Magnitud asociada a una etiqueta de unidad, o null si no se convierte. */
export function kindFromUnit(unit) {
  if (!unit) return null;
  const key = String(unit).trim();
  return Object.prototype.hasOwnProperty.call(KIND_BY_UNIT, key) ? KIND_BY_UNIT[key] : null;
}

/**
 * Juego de utilidades de conversion atado a un sistema, pensado para inyectarse
 * en el view-model que reciben las formulas de cada componente:
 *
 *   const vm = Object.assign({ pressure: 150, flow: 30, comp: comp }, unitHelpers('imp'));
 *   vm.fmtU('force', 73.136);   // '16,434 lbf'
 *   vm.label('pressure');       // 'psi'
 *
 * Asi los specs no necesitan saber que sistema esta activo.
 */
export function unitHelpers(system) {
  const sys = (system === SYSTEMS.IMPERIAL) ? SYSTEMS.IMPERIAL : SYSTEMS.SI;
  return {
    system: sys,
    label: function (kind) { return unitLabel(kind, sys); },
    fmt: function (kind, value, decimals) { return formatValue(kind, value, sys, decimals); },
    fmtU: function (kind, value, decimals) { return formatWithUnit(kind, value, sys, decimals); },
    conv: function (kind, value) { return convert(kind, value, sys); }
  };
}
