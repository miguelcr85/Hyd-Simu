// ================================================================
// PANEL EDUCATIVO — CONSTRUCTOR DE HTML (dominio puro, sin DOM)
// ================================================================
//
// Genera el HTML del panel que aparece bajo el tablero al seleccionar un
// componente: que es, para que sirve, sus entradas/salidas, las variables que
// usa (con su valor actual) y las FORMULAS de diseno con la sustitucion
// numerica y el resultado.
//
// Es una funcion pura (recibe datos, devuelve una cadena) para poder probarla
// sin navegador; el pegamento con el DOM vive en js/app.js.
//
// Fuentes de datos:
//   definition -> js/core/component-definitions.js (nombre, puertos, parametros)
//   spec       -> ComponentSpec (docs, equations)
//   vm         -> valores medidos en el circuito y sistema de unidades activo
// ================================================================

import { SYSTEMS, formatWithUnit, formatValue, convert, unitLabel } from '../core/units.js';

/** Magnitudes vivas que el panel muestra si el componente las calcula. */
const LIVE_METRICS = [
  { key: '_localPressure', label: 'Pressure at the component', kind: 'pressure' },
  { key: '_localFlow', label: 'Flow through the component', kind: 'flow' },
  { key: '_inputPower', label: 'Mechanical power received', kind: 'power' },
  { key: '_inputRPM', label: 'Input speed received', kind: 'rpm' },
  { key: '_forceKN', label: 'Effective force', kind: 'force' },
  { key: '_speedMMS', label: 'Piston speed', kind: 'speed' },
  { key: '_torque', label: 'Output torque', kind: 'torque' },
  { key: '_rpm', label: 'Rotational speed', kind: 'rpm' },
  { key: '_power', label: 'Output power', kind: 'power' }
];

function esc(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function list(items, className) {
  if (!items || !items.length) return '';
  return '<ul class="' + className + '">' + items.map(function (item) {
    return '<li>' + esc(item) + '</li>';
  }).join('') + '</ul>';
}

/* ── Secciones ─────────────────────────────────────────────────────────── */

function portsSection(definition, vm, docs) {
  const ports = (definition && definition.ports) || [];
  if (!ports.length) return '';
  const rows = ports.map(function (port, idx) {
    const live = (vm.ports || []).filter(function (p) { return p.idx === idx; })[0];
    const readings = live
      ? formatWithUnit('pressure', live.pressure, vm.system) + ' · ' + formatWithUnit('flow', live.flow, vm.system)
      : 'not connected';
    const role = live && live.portRole ? live.portRole : (port.label === 'Pilot' ? 'pilot signal' : 'fluid');
    return '<tr><td class="edu-port">' + esc(port.label) + '</td>' +
           '<td>' + esc(role) + '</td>' +
           '<td class="edu-num">' + esc(readings) + '</td></tr>';
  }).join('');

  const extra = [];
  if (docs && docs.inputs && docs.inputs.length) extra.push('Inlets / signals: ' + docs.inputs.join(' · '));
  if (docs && docs.outputs && docs.outputs.length) extra.push('Outlets: ' + docs.outputs.join(' · '));

  return '<h4>Ports — live values</h4>' +
    '<table class="edu-table"><thead><tr><th>Port</th><th>Function</th><th>Pressure · flow</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    list(extra, 'edu-list edu-list-plain');
}

function variablesSection(definition, comp, docs, system) {
  const params = (definition && definition.params) || {};
  const rows = Object.keys(params).map(function (key) {
    const param = params[key];
    const value = (comp && comp.values && comp.values[key] !== undefined) ? comp.values[key] : param.def;
    const unit = unitFromLabel(param.label);
    let shown = value;
    if (typeof value === 'number' && unit) {
      shown = formatWithUnit(unit, value, system, unit === 'length' ? 1 : undefined);
    }
    return '<tr><td>' + esc(labelWithoutUnit(param.label)) + '</td>' +
           '<td class="edu-num">' + esc(shown) + '</td></tr>';
  }).join('');

  const symbols = (docs && docs.variables) || [];
  const symbolList = symbols.map(function (v) {
    const label = v.unit ? (unitLabel(v.unit, system) || v.unit) : '';
    return '<li><code>' + esc(v.symbol) + '</code> — ' + esc(v.name) +
      (label ? ' <span class="edu-unit">[' + esc(label) + ']</span>' : '') + '</li>';
  }).join('');

  return '<h4>Variables</h4>' +
    (rows ? '<table class="edu-table edu-table-vars"><tbody>' + rows + '</tbody></table>' : '') +
    (symbolList ? '<ul class="edu-list edu-symbols">' + symbolList + '</ul>' : '');
}

/** 'Pressure (bar)' -> 'Pressure' */
function labelWithoutUnit(label) {
  return String(label || '').replace(/\s*\([^)]*\)\s*$/, '');
}

/** 'Pressure (bar)' -> 'pressure' (magnitud para la conversion) */
function unitFromLabel(label) {
  const match = String(label || '').match(/\(([^)]*)\)\s*$/);
  if (!match) return null;
  const raw = match[1].trim();
  const map = {
    'bar': 'pressure', 'psi': 'pressure',
    'L/min': 'flow', 'gpm': 'flow',
    'kW': 'power', 'hp': 'power',
    'kN': 'force', 'lbf': 'force',
    'mm/s': 'speed', 'in/s': 'speed',
    'Nm': 'torque', 'rpm': 'rpm', 'RPM': 'rpm',
    'mm': 'length', 'in': 'length',
    'L': 'volume', 'gal': 'volume',
    'cm³/rev': 'displacement', 'in³/rev': 'displacement',
    '%': 'percent', '°C': 'temperature', '°F': 'temperature'
  };
  return map[raw] || null;
}

/* ── Formula(s) de diseno ─────────────────────────────────────────────── */

function equationsSection(spec, vm, system) {
  if (!spec || typeof spec.equations !== 'function') return '';
  let list;
  try {
    list = spec.equations(vm) || [];
  } catch (err) {
    return '<h4>Design formulas</h4><p class="edu-warn">Formulas could not be computed: ' +
      esc(err && err.message ? err.message : err) + '</p>';
  }
  if (!list.length) return '';

  const blocks = list.map(function (eq) {
    const parts = ['<div class="edu-eq">'];
    parts.push('<div class="edu-eq-title">' + esc(eq.title || 'Formula') + '</div>');
    if (eq.formula) parts.push('<div class="edu-eq-formula">' + esc(eq.formula) + '</div>');
    if (eq.where) parts.push('<div class="edu-eq-where">' + esc(eq.where) + '</div>');
    if (eq.substitution) parts.push('<div class="edu-eq-sub">' + esc(eq.substitution) + '</div>');
    if (eq.result) parts.push('<div class="edu-eq-result">= ' + esc(eq.result) + '</div>');
    if (eq.notes) parts.push('<div class="edu-eq-notes">' + esc(eq.notes) + '</div>');
    parts.push('</div>');
    return parts.join('');
  }).join('');

  return '<h4>Design formulas</h4>' + blocks;
}

/* ── Valores medidos ─────────────────────────────────────────────────── */

function liveSection(comp, vm, docs, system) {
  const rows = [];
  let hasValue = false;

  LIVE_METRICS.forEach(function (metric) {
    const value = comp ? comp[metric.key] : undefined;
    if (typeof value !== 'number' || !isFinite(value)) return;
    if (value !== 0) hasValue = true;
    rows.push('<tr><td>' + esc(metric.label) + '</td><td class="edu-num">' +
      esc(formatWithUnit(metric.kind, value, system)) + '</td></tr>');
  });

  /* Lectura propia de los instrumentos (manometro, termometro, caudalimetro) */
  const instrument = docs && docs.instrument;
  if (instrument && comp && typeof comp.reading === 'number' && isFinite(comp.reading)) {
    if (comp.reading !== 0) hasValue = true;
    rows.push('<tr><td>' + esc(instrument.label) + '</td><td class="edu-num">' +
      esc(formatWithUnit(instrument.kind, comp.reading, system)) + '</td></tr>');
  }

  /* Al arrancar no hay nada que medir todavia: se invita a ejecutar la simulacion */
  if (!rows.length || (!vm.running && !hasValue)) {
    return '<h4>Measured values</h4><p class="edu-muted">' +
      (vm.running ? 'No pressure or flow reaches this component yet.' : 'Press Run to see measured values.') +
      '</p>';
  }
  return '<h4>Measured values</h4><table class="edu-table edu-table-live"><tbody>' +
    rows.join('') + '</tbody></table>';
}

function tipsSection(docs) {
  const tips = (docs && docs.tips) || [];
  if (!tips.length) return '';
  return '<h4>Practical notes</h4>' + list(tips, 'edu-list edu-tips');
}

function unitsNote(system) {
  const label = (system === SYSTEMS.IMPERIAL) ? 'Imperial (US)' : 'International (SI)';
  return '<p class="edu-units">Display units: <strong>' + esc(label) + '</strong>. ' +
    esc('The solver always computes in SI (bar, L/min, mm); the values shown here are converted for display.') +
    '</p>';
}

/* ── Cuerpo completo del panel ────────────────────────────────────────── */

/**
 * Construye el HTML del panel educativo del componente seleccionado.
 *
 * @param {{ definition:Object, spec:Object, comp:Object, vm:Object }} input
 * @returns {string} HTML listo para insertar en el contenedor del panel
 */
export function componentDocsHtml(input) {
  const source = input || {};
  const definition = source.definition || {};
  const spec = source.spec || null;
  const comp = source.comp || null;
  /* Copia del view-model: nunca se muta el objeto del llamador. Si el llamador
     no enlazo el componente, se enlaza aqui para que las formulas puedan leer
     sus valores medidos. */
  const vm = Object.assign({}, source.vm || {});
  if (comp && !vm.comp) vm.comp = comp;
  const system = vm.system || SYSTEMS.SI;
  const docs = (spec && spec.docs) || null;

  const name = definition.name || (spec && spec.label) || (comp && comp.type) || 'Component';
  const typeLabel = comp ? comp.type : '';
  const roleLabel = spec ? spec.role : 'not registered';

  const head = '<div class="edu-head">' +
    '<span class="edu-name">' + esc(name) + '</span>' +
    '<span class="edu-type">' + esc(typeLabel) + (roleLabel ? ' · ' + esc(roleLabel) : '') + '</span>' +
    '<span class="edu-badge' + (vm.running ? ' edu-badge-live' : '') + '">' +
    (vm.running ? 'running' : 'stopped') + '</span>' +
    '</div>';

  const summary = (docs && docs.summary) ? '<p class="edu-summary">' + esc(docs.summary) + '</p>' : '';
  const how = (docs && docs.how) ? '<p class="edu-text">' + esc(docs.how) + '</p>' : '';
  const standard = (docs && docs.standard)
    ? '<p class="edu-note"><strong>ISO 1219 symbol:</strong> ' + esc(docs.standard) + '</p>' : '';

  const body = [
    head,
    summary,
    how,
    standard,
    '<div class="edu-grid">' + portsSection(definition, vm, docs, system) +
      variablesSection(definition, comp, docs, system) + '</div>',
    equationsSection(spec, vm, system),
    liveSection(comp, vm, docs, system),
    tipsSection(docs),
    unitsNote(system)
  ];

  return body.filter(function (part) { return !!part; }).join('');
}

export { SYSTEMS };
