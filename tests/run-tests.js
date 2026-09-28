// ================================================================
// RUNNER DE TESTS — carga las suites y vuelca el resultado en el DOM
// ================================================================
// Uso:  python -m http.server 8123   ->   http://localhost:8123/tests/index.html
// Validacion sin Node:  chrome --headless=new --dump-dom <url>
// (el resumen tambien se escribe en document.title)
// ================================================================

import { runAll } from './harness.js';

// Suites (se importan por su efecto: registran describe/it)
import './cases/definitions.test.js';
import './cases/valve-routing.test.js';
import './cases/passthrough-valves.test.js';
import './cases/passthrough-restrictions.test.js';
import './cases/solver-source.test.js';
import './cases/solver-actuators.test.js';
import './cases/solver-motors.test.js';
import './cases/catalog-smoke.test.js';
import './cases/registry.test.js';
import './cases/registry-equivalence.test.js';
import './cases/units.test.js';
import './cases/component-docs.test.js';
import './cases/component-docs-robust.test.js';
import './cases/docs-coverage.test.js';
import './cases/architecture.test.js';

const fatals = [];
window.addEventListener('error', function (e) {
  fatals.push('Error no capturado: ' + (e.message || e.error));
});
window.addEventListener('unhandledrejection', function (e) {
  fatals.push('Promesa rechazada: ' + ((e.reason && e.reason.message) || e.reason));
});

const summaryEl = document.getElementById('summary');
const listEl = document.getElementById('results');
const fatalEl = document.getElementById('fatals');

function line(text, cls) {
  const div = document.createElement('div');
  div.className = 'case ' + (cls || '');
  div.textContent = text;
  listEl.appendChild(div);
}

const reporter = {
  startSuite(name) { line('— ' + name, 'suite'); },
  pass(suite, name) { line('ok   ' + name, 'pass'); },
  fail(suite, name, message) {
    line('FALLO ' + name + '  →  ' + message, 'fail');
    const box = document.getElementById('failures');
    const div = document.createElement('div');
    div.className = 'case fail';
    div.textContent = suite + ' › ' + name + '  →  ' + message;
    box.appendChild(div);
  },
  done(s) {
    const resumen = 'TOTAL ' + s.total + ' | PASS ' + s.pass + ' | FAIL ' + s.failed + ' | ' + s.ms + ' ms';
    summaryEl.textContent = resumen;
    summaryEl.className = s.failed === 0 && fatals.length === 0 ? 'summary ok' : 'summary ko';
    document.title = (s.failed === 0 && fatals.length === 0 ? 'PASS ' : 'FAIL ') + s.pass + '/' + s.total;
  }
};

try {
  await runAll(reporter);
} catch (err) {
  fatals.push('El runner se detuvo: ' + ((err && err.message) || err));
}

if (fatals.length > 0) {
  fatalEl.textContent = fatals.join('\n');
  fatalEl.style.display = 'block';
  document.title = 'FAIL (excepciones) ' + document.title;
}
