// ================================================================
// HARNESS DE TESTS — micro framework sin dependencias (navegador)
// ================================================================
//
// Se ejecuta en `tests/index.html` (servido con `python -m http.server`),
// sin Node ni librerias externas.
//
//   describe('familia', function () { it('caso', function () { ... }); });
//
// El runner es asincrono (permite tests que usan fetch) y delega el volcado de
// resultados en un "reporter", de modo que la misma suite podria ejecutarse en
// otro entorno cambiando solo el reporter.
// ================================================================

const suites = [];
let current = null;

/** Agrupa casos de prueba. */
export function describe(name, fn) {
  current = { name: name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

/** Declara un caso de prueba. `fn` puede ser sincrona o devolver una promesa. */
export function it(name, fn) {
  if (!current) throw new Error('it() debe llamarse dentro de un describe()');
  current.tests.push({ name: name, fn: fn });
}

function fmt(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(fmt).join(', ') + ']';
  try { return JSON.stringify(value); } catch (e) { return String(value); }
}

function fail(message) { throw new Error(message); }

/** Aserciones. Cada metodo lanza un Error con el detalle del fallo. */
export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) fail('se esperaba ' + fmt(expected) + ' pero se obtuvo ' + fmt(actual));
    },
    toBeCloseTo(expected, eps) {
      if (eps === undefined) eps = 1e-6;
      if (typeof actual !== 'number' || !isFinite(actual) || Math.abs(actual - expected) > eps) {
        fail('se esperaba ~' + expected + ' (+-' + eps + ') pero se obtuvo ' + fmt(actual));
      }
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) fail('se esperaba un valor > ' + n + ' pero se obtuvo ' + fmt(actual));
    },
    toBeLessThan(n) {
      if (!(actual < n)) fail('se esperaba un valor < ' + n + ' pero se obtuvo ' + fmt(actual));
    },
    toBeGreaterThanOrEqual(n) {
      if (!(actual >= n)) fail('se esperaba un valor >= ' + n + ' pero se obtuvo ' + fmt(actual));
    },
    toBeLessThanOrEqual(n) {
      if (!(actual <= n)) fail('se esperaba un valor <= ' + n + ' pero se obtuvo ' + fmt(actual));
    },
    toBeTruthy() {
      if (!actual) fail('se esperaba un valor verdadero pero se obtuvo ' + fmt(actual));
    },
    toBeFalsy() {
      if (actual) fail('se esperaba un valor falso pero se obtuvo ' + fmt(actual));
    },
    toBeDefined() {
      if (actual === undefined) fail('se esperaba un valor definido pero se obtuvo undefined');
    },
    toBeNull() {
      if (actual !== null) fail('se esperaba null pero se obtuvo ' + fmt(actual));
    },
    toEqual(expected) {
      const a = JSON.stringify(actual), e = JSON.stringify(expected);
      if (a !== e) fail('se esperaba ' + e + ' pero se obtuvo ' + a);
    },
    toContain(expected) {
      const isText = typeof actual === 'string';
      const found = isText ? actual.indexOf(expected) >= 0
                           : Array.isArray(actual) && actual.indexOf(expected) >= 0;
      if (!found) fail('no se encontro ' + fmt(expected) + ' en ' + fmt(actual));
    },
    lengthOf(n) {
      if (!actual || actual.length !== n) {
        fail('se esperaba longitud ' + n + ' pero se obtuvo ' + (actual ? actual.length : actual));
      }
    }
  };
}

/** Aserciones invertidas (para comprobar ausencias). */
export function expectNot(actual) {
  return {
    toContain(expected) {
      const isText = typeof actual === 'string';
      const found = isText ? actual.indexOf(expected) >= 0
                           : Array.isArray(actual) && actual.indexOf(expected) >= 0;
      if (found) fail('no se esperaba encontrar ' + fmt(expected));
    },
    toBeFalsy() {
      if (!actual) fail('se esperaba un valor verdadero (truthy)');
    },
    toBeTruthy() {
      if (actual) fail('se esperaba un valor falso (falsy)');
    },
    toBe(expected) {
      if (actual === expected) fail('no se esperaba ' + fmt(expected));
    }
  };
}

/** Ejecuta `fn` y devuelve el error capturado (falla si no lanza). */
export function expectThrow(fn) {
  try { fn(); } catch (err) { return err; }
  fail('se esperaba una excepcion y no hubo ninguna');
}

/** Ejecuta todas las suites contra un reporter. */
export async function runAll(reporter) {
  const started = Date.now();
  let total = 0, pass = 0, failed = 0;
  for (let s = 0; s < suites.length; s++) {
    const suite = suites[s];
    reporter.startSuite(suite.name);
    for (let t = 0; t < suite.tests.length; t++) {
      total++;
      try {
        await suite.tests[t].fn();
        pass++;
        reporter.pass(suite.name, suite.tests[t].name);
      } catch (err) {
        failed++;
        reporter.fail(suite.name, suite.tests[t].name, (err && err.message) ? err.message : String(err));
      }
    }
  }
  const summary = { total: total, pass: pass, failed: failed, ms: Date.now() - started };
  reporter.done(summary);
  return summary;
}
