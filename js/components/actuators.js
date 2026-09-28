// ================================================================
// ACTUADORES (7 tipos)
// ================================================================
// - Lineales: cilindro de doble efecto, de simple efecto y telescopico.
// - Rotativos: motor, motor bidireccional, motor LSHT Poclain y actuador rotativo.
//
// En E2 los actuadores declaran su rol y (cuando la tabla legacy tenia una regla)
// su regla de conduccion. Los calculos de carga (fuerza, par, velocidad) siguen
// en el solver y se migraran a `physics.solve()` en la siguiente etapa, junto con
// las metricas del panel educativo.
// ================================================================

import { ROLES } from '../core/registry.js';

function blocked() { return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 }; }

/* Motor LSHT Poclain MS35: A(0) -> B(1) con 2 bar de perdida y rendimiento
   volumetrico; B(1) -> A(0) con las mismas perdidas. El drenaje (2) es ciego. */
function poclain(comp, port, pressure, flow) {
  if (port === 0) {
    const effVol = (comp.values.efficiencyVol || 92) / 100;
    return { canFlow: true, outPort: 1, pressureDrop: 2, flowLimit: flow * effVol };
  }
  if (port === 1) {
    return { canFlow: true, outPort: 0, pressureDrop: 2, flowLimit: flow };
  }
  if (port === 2) return blocked();
  return blocked();
}

/* ── Cargas: se calculan cuando el solver visita el puerto (ctx) ─────────── */

/**
 * Cilindro lineal. Migrado de la fase PASO 12 del solver (etapa E2) y ampliado
 * para informar la fuerza y la velocidad efectivas (desviacion D5 corregida).
 *
 *   F [kN]  = P [bar] x 0,1 x A [mm2] / 1000
 *   v [mm/s] = Q [L/min] x 1e6 / 60 / A [mm2]
 */
function solveCylinder(comp, ctx) {
  const bore = comp.values.bore || 80;
  const rod = comp.values.rod || 45;
  const areaBore = Math.PI / 4 * bore * bore;
  const areaAnnulus = Math.PI / 4 * (bore * bore - rod * rod);

  comp._speedFactor = ctx.flow / 30 * 0.8;
  comp._extending = (ctx.portIdx === 0 && ctx.pressure > 10);

  if (comp._extending) {
    /* Contrapresion en el puerto B: puede indicar bloqueo o secuencia */
    let backPressure = 0;
    const rodKey = comp.id + ':1';
    if (ctx.adj[rodKey]) {
      ctx.adj[rodKey].forEach(function (a) {
        const cn = ctx.connections[a.connIdx];
        if (cn) backPressure = Math.max(backPressure, cn.pressure || 0);
      });
    }
    comp._stalled = backPressure > 5;
  } else if (ctx.portIdx === 1 && ctx.pressure > 10) {
    comp._extending = false;
    comp._stalled = false;
  }

  /* Fuerza y velocidad efectivas (para los readouts de la interfaz) */
  const effectiveArea = comp._extending ? areaBore : areaAnnulus;
  comp._forceKN = ctx.pressure * 0.1 * effectiveArea / 1000;
  comp._speedMMS = ctx.flow * 1e6 / 60 / effectiveArea;
}

/** Motor volumetrico: T = P x V / 20pi  ;  n = Q x 1000 / V */
function solveMotor(comp, ctx) {
  const displacement = comp.values.displacement || 25;
  comp._torque = (ctx.pressure * displacement) / (20 * Math.PI);
  comp._rpm = (ctx.flow * 1000) / displacement;
  comp._localPressure = ctx.pressure;
}

/* Desviacion D7 (docs/BASELINE.md): en el modelo actual el motor NO propaga
   caudal al puerto de retorno (el motor anterior hacia `continue`). Se declara
   `noConduction` para conservar ese comportamiento SIN falsear la tabla de
   reglas (la tabla legacy los declaraba transparentes); cuando se decida
   corregir D7 bastara con quitar esa marca. */

/** Motor LSHT Poclain: par limitado por el par maximo y rendimientos. */
function solvePoclain(comp, ctx) {
  const displacement = comp.values.displacement || 380;
  const maxRPM = comp.values.speedMax || 300;
  const effVol = (comp.values.efficiencyVol || 92) / 100;
  const effMech = (comp.values.efficiencyMech || 90) / 100;
  const torqueMax = comp.values.torqueMax || 1800;

  if (ctx.pressure > 0 && ctx.flow > 0) {
    const theoreticalTorque = (ctx.pressure * displacement) / (20 * Math.PI);
    const torque = Math.min(theoreticalTorque, torqueMax) * effMech;
    comp._torque = torque;
    comp._localPressure = ctx.pressure;
    comp._localFlow = ctx.flow;

    if (displacement > 0) {
      const theoreticalRPM = (ctx.flow * 1000) / displacement;
      const rpm = Math.min(theoreticalRPM * effVol, maxRPM);
      comp._rpm = rpm;
      comp._speedFactor = rpm / maxRPM;
      comp._power = (torque * rpm) / 9550;

      /* Datos de rendimiento sobre la conexion de entrada */
      const key = comp.id + ':' + ctx.portIdx;
      if (ctx.adj[key]) {
        ctx.adj[key].forEach(function (a) {
          const cn = ctx.connections[a.connIdx];
          if (cn) {
            cn.rpm = rpm;
            cn.power = comp._power;
            cn.torque = torque;
          }
        });
      }

      comp._atMaxSpeed = (rpm >= maxRPM * 0.95);
      comp._atMaxTorque = (torque >= torqueMax * 0.95);
    }
  } else {
    comp._rpm = 0;
    comp._speedFactor = 0;
    comp._power = 0;
    comp._atMaxSpeed = false;
    comp._atMaxTorque = false;
  }
}

/* ── Documentacion y formulas (panel educativo) ─────────────────────────── */

/** Areas del cilindro a partir de sus valores actuales (mm²). */
function cylinderAreas(comp) {
  const bore = comp.values.bore || 80;
  const rod = comp.values.rod || 45;
  return {
    bore: bore,
    rod: rod,
    areaBore: Math.PI / 4 * bore * bore,
    areaAnnulus: Math.PI / 4 * (bore * bore - rod * rod)
  };
}

function cylinderDocs(single) {
  return {
    summary: single
      ? 'Single-acting cylinder: pressure extends it and a spring (or the load) returns it.'
      : 'Double-acting cylinder: pressure on either side moves the piston both ways, so it can push and pull.',
    how: single
      ? 'Oil enters the cap port and acts on the full piston area. When the directional valve releases that port, the spring (or the load) retracts the rod. Only one line is needed, so the circuit is simpler, but the return force is not controlled.'
      : 'Oil enters port A and acts on the piston area, pushing the rod out while the oil on the rod side (B) returns to tank. Feeding B reverses the motion: the effective area is then smaller (piston area minus rod area), so the retract force is lower and the retract speed higher for the same flow.',
    standard: single
      ? 'Piston with a single pressure line and a spring return drawn on the cap side.'
      : 'Rectangle with piston and rod and two port lines (A cap side, B rod side).',
    inputs: single ? ['P — pressure into the cap side'] : ['A — pressure into the cap side', 'B — pressure into the rod side'],
    outputs: single ? ['Return flow to tank when the port is released'] : ['Return flow from the opposite side'],
    variables: [
      { symbol: 'P', name: 'Working pressure', unit: 'pressure' },
      { symbol: 'Q', name: 'Flow into the cylinder', unit: 'flow' },
      { symbol: 'A', name: 'Effective piston area', unit: 'length' },
      { symbol: 'F', name: 'Theoretical force', unit: 'force' },
      { symbol: 'v', name: 'Piston speed', unit: 'speed' }
    ],
    tips: [
      'Force comes from pressure × area, not from speed: a bigger bore lifts more, more flow moves faster.',
      'With a large rod the retract force drops a lot — check the rod diameter when pulling a load.',
      '1 bar = 0.1 N/mm² is the conversion used in every hydraulic design calculation.'
    ]
  };
}

function cylinderEquations(vm) {
  const a = cylinderAreas(vm.comp);
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const forceExtend = P * 0.1 * a.areaBore / 1000;                  /* kN */
  const forceRetract = P * 0.1 * a.areaAnnulus / 1000;              /* kN */
  const speedExtend = a.areaBore ? Q * 1e6 / 60 / a.areaBore : 0;   /* mm/s */
  const stroke = vm.comp.values.stroke || 0;

  const out = [{
    title: 'Extend force — F = P × A',
    formula: 'F = P × A × 0.1 / 1000',
    where: 'P in bar · A in mm² (A = π/4 · bore²) · F in kN, because 1 bar = 0.1 N/mm²',
    notes: 'This is the expression the simulator evaluates while the cylinder extends.'
  }, {
    title: 'Retract force (rod side)',
    formula: 'F = P × A_annulus × 0.1 / 1000',
    where: 'A_annulus = π/4 · (bore² − rod²)',
    notes: 'The rod reduces the effective area, so the retract force is ' +
      (a.areaBore ? (a.areaAnnulus / a.areaBore * 100).toFixed(0) : '0') + ' % of the extend force.'
  }, {
    title: 'Piston speed — v = Q / A',
    formula: 'v = Q × 10⁶ / (60 × A)',
    where: 'Q in L/min · A in mm² · v in mm/s',
    notes: stroke ? 'Full stroke takes ' + (speedExtend > 0 ? (stroke / speedExtend).toFixed(2) + ' s' : '—') + '.' : undefined
  }, {
    title: 'Area ratio (speed ratio)',
    formula: 'ratio = A / A_annulus',
    where: 'Extension and retraction do not move at the same speed',
    result: a.areaAnnulus ? (a.areaBore / a.areaAnnulus).toFixed(2) + ' : 1' : '—'
  }];

  if (P > 0) {
    out[0].substitution = 'F = ' + vm.fmt('pressure', P) + ' × ' + a.areaBore.toFixed(0) + ' × 0.1 / 1000';
    out[0].result = vm.fmtU('force', forceExtend);
    out[1].substitution = 'F = ' + vm.fmt('pressure', P) + ' × ' + a.areaAnnulus.toFixed(0) + ' × 0.1 / 1000';
    out[1].result = vm.fmtU('force', forceRetract);
  }
  if (Q > 0) {
    out[2].substitution = 'v = ' + vm.fmt('flow', Q) + ' × 10⁶ / (60 × ' + a.areaBore.toFixed(0) + ')';
    out[2].result = vm.fmtU('speed', speedExtend);
  }
  return out;
}

function motorDocs() {
  return {
    summary: 'Hydraulic motor: converts hydraulic pressure and flow into rotary torque and speed.',
    how: 'Pressurised oil enters one port and pushes the motor elements (gear, vane or piston), leaving through the other port. Torque is set by pressure and displacement; speed is set by flow and displacement. Adding a gearbox or a wheel changes torque and speed, but not power.',
    standard: 'Circle with a filled triangle pointing outwards and the two work lines (A, B).',
    inputs: ['A — pressure inlet', 'B — return to tank'],
    outputs: ['Mechanical torque and rotation at the shaft'],
    variables: [
      { symbol: 'ΔP', name: 'Pressure difference across the motor', unit: 'pressure' },
      { symbol: 'V', name: 'Displacement per revolution', unit: 'displacement' },
      { symbol: 'T', name: 'Output torque', unit: 'torque' },
      { symbol: 'n', name: 'Rotational speed', unit: 'rpm' }
    ],
    tips: [
      'Doubling the displacement halves the speed and doubles the torque for the same flow and pressure.',
      'Power is pressure × flow: it does not change with gearing, only torque and speed are traded.'
    ]
  };
}

function motorEquations(vm) {
  const displacement = vm.comp.values.displacement || 25;   /* cm³/rev */
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const torque = P * displacement / (20 * Math.PI);          /* Nm */
  const rpm = displacement ? Q * 1000 / displacement : 0;
  const power = torque * rpm / 9550;                         /* kW */

  const out = [{
    title: 'Output torque — T = ΔP · V / 20π',
    formula: 'T = ΔP × V / (20 × π)',
    where: 'ΔP in bar · V in cm³/rev · T in Nm',
    notes: 'Torque comes from pressure and displacement; speed comes from flow.'
  }, {
    title: 'Rotational speed — n = Q / V',
    formula: 'n = Q × 1000 / V',
    where: 'Q in L/min · V in cm³/rev · n in rpm'
  }, {
    title: 'Hydraulic power',
    formula: 'P = ΔP × Q / 600 = T × n / 9550',
    where: 'P in kW · ΔP in bar · Q in L/min',
    notes: 'Both expressions give the same result — use one to check the other.'
  }];

  if (P > 0) {
    out[0].substitution = 'T = ' + vm.fmt('pressure', P) + ' × ' + vm.fmt('displacement', displacement) + ' / (20 × π)';
    out[0].result = vm.fmtU('torque', torque);
  }
  if (Q > 0) {
    out[1].substitution = 'n = ' + vm.fmt('flow', Q) + ' × 1000 / ' + vm.fmt('displacement', displacement);
    out[1].result = vm.fmtU('rpm', rpm);
  }
  if (P > 0 && Q > 0) {
    out[2].substitution = 'P = ' + vm.fmt('pressure', P) + ' × ' + vm.fmt('flow', Q) + ' / 600';
    out[2].result = vm.fmtU('power', power);
  }
  return out;
}

function poclainDocs() {
  return {
    summary: 'Poclain MS35 low-speed high-torque (LSHT) wheel motor: drives a wheel directly, without a gearbox.',
    how: 'A radial-piston LSHT motor turns the wheel through its own hub. Because the displacement per revolution is very large it produces high torque at low speed (typically 0–300 rpm), which is ideal for forest machinery drives. Volumetric efficiency reduces the actual speed and mechanical efficiency reduces the actual torque; the manufacturer limits both with a maximum speed and a maximum torque.',
    standard: 'Circle with an outward triangle plus the shaft/wheel connection and the case drain line.',
    inputs: ['A — pressure inlet', 'B — return line', 'D — case drain to tank'],
    outputs: ['Wheel torque, speed and tractive effort'],
    variables: [
      { symbol: 'V', name: 'Motor displacement', unit: 'displacement' },
      { symbol: 'η_vol', name: 'Volumetric efficiency', unit: 'percent' },
      { symbol: 'η_mech', name: 'Mechanical efficiency', unit: 'percent' },
      { symbol: 'D', name: 'Wheel diameter', unit: 'length' },
      { symbol: 'i', name: 'Gear ratio', unit: 'ratio' }
    ],
    tips: [
      'LSHT motors are used when no gearbox is wanted (harvesters, forwarders, winches).',
      'Never plug the case drain: without it the shaft seal fails. Return it to tank with no back-pressure.',
      'Speed and torque limits come from the manufacturer; the simulator applies them automatically.'
    ]
  };
}

function poclainEquations(vm) {
  const displacement = vm.comp.values.displacement || 380;
  const speedMax = vm.comp.values.speedMax || 300;
  const effVol = (vm.comp.values.efficiencyVol || 92) / 100;
  const effMech = (vm.comp.values.efficiencyMech || 90) / 100;
  const torqueMax = vm.comp.values.torqueMax || 1800;
  const wheel = vm.comp.values.wheelDiameter || 500;      /* mm */
  const ratio = vm.comp.values.gearRatio || 1;
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;

  const torque = Math.min(P * displacement / (20 * Math.PI), torqueMax) * effMech;
  const rpm = displacement ? Math.min(Q * 1000 / displacement * effVol, speedMax) : 0;
  const speedKmh = (rpm > 0 && wheel > 0) ? (rpm * Math.PI * wheel) / (60 * 1000 * ratio) * 3.6 : 0;
  const radiusM = (wheel / 2) / 1000;
  const tractive = radiusM > 0 ? (torque * ratio / radiusM) / 1000 : 0;   /* kN */

  const out = [{
    title: 'Effective torque (LSHT motor)',
    formula: 'T = min(ΔP × V / 20π, T_max) × η_mech',
    where: 'ΔP in bar · V in cm³/rev · η_mech = ' + (effMech * 100).toFixed(0) + ' %'
  }, {
    title: 'Shaft speed with volumetric losses',
    formula: 'n = min(Q × 1000 / V × η_vol, n_max)',
    where: 'Q in L/min · η_vol = ' + (effVol * 100).toFixed(0) + ' % · n_max = ' + speedMax + ' rpm'
  }, {
    title: 'Vehicle speed from the wheel diameter',
    formula: 'v = n × π × D / (60 × 1000 × i) × 3.6',
    where: 'D = wheel diameter (mm) · i = gear ratio · v in km/h'
  }, {
    title: 'Tractive effort at the wheel',
    formula: 'F = T × i / r_wheel',
    where: 'T in Nm · r in m · F in kN',
    notes: 'The force this wheel can push or pull with.'
  }];

  if (P > 0) {
    out[0].substitution = 'T = min(' + vm.fmt('pressure', P) + ' × ' + vm.fmt('displacement', displacement) + ' / 20π, ' + torqueMax + ') × ' + effMech;
    out[0].result = vm.fmtU('torque', torque);
    out[3].substitution = 'F = ' + vm.fmt('torque', torque) + ' × ' + ratio + ' / ' + radiusM.toFixed(3);
    out[3].result = vm.fmtU('force', tractive);
  }
  if (Q > 0) {
    out[1].substitution = 'n = min(' + vm.fmt('flow', Q) + ' × 1000 / ' + vm.fmt('displacement', displacement) + ' × ' + effVol + ', ' + speedMax + ')';
    out[1].result = vm.fmtU('rpm', rpm);
    out[2].substitution = 'v = ' + vm.fmt('rpm', rpm) + ' × π × ' + wheel + ' / (60 × 1000 × ' + ratio + ') × 3.6';
    out[2].result = vm.fmtU('speedKmh', speedKmh);
  }
  return out;
}

function telescopicDocs() {
  return {
    summary: 'Telescopic cylinder: nested stages extend in sequence to give a very long stroke from a short retracted length.',
    how: 'Stages extend one after another, starting with the largest piston area. As each smaller stage takes over, the effective area decreases, so the force falls and the speed rises for the same flow. Typical of tipper trailers, crane booms and loader arms.',
    standard: 'Several nested rectangles with the piston lines staggered (multi-stage cylinder).',
    inputs: ['P — pressure into the largest stage'],
    outputs: ['Sequential extension of each stage; return by pressure or by load'],
    variables: [
      { symbol: 'A_stage', name: 'Area of the active stage', unit: 'length' },
      { symbol: 'F', name: 'Force at the active stage', unit: 'force' },
      { symbol: 'L_total', name: 'Sum of all stage strokes', unit: 'length' }
    ],
    tips: [
      'The first stage lifts the load: it has the largest area and therefore the highest force.',
      'The last stage moves fastest but can lift the least — check the load at the end of the stroke.'
    ]
  };
}

function telescopicEquations(vm) {
  const bore = vm.comp.values.bore || 80;
  const stroke = vm.comp.values.stroke || 300;
  const stages = (vm.comp.values.stages || 3);
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const area = Math.PI / 4 * bore * bore / stages;   /* área media por etapa (modelo simplificado) */
  const force = P * 0.1 * area / 1000;
  const speed = area ? Q * 1e6 / 60 / area : 0;

  const out = [{
    title: 'Force per stage — F = P × A_stage',
    formula: 'F = P × A_stage × 0.1 / 1000',
    where: 'Each stage has its own area; the force drops as the stages get smaller'
  }, {
    title: 'Total stroke',
    formula: 'L = Σ stroke_of_each_stage',
    where: 'With ' + stages + ' stages of ' + stroke + ' mm the total extension is about ' + (stages * stroke) + ' mm'
  }, {
    title: 'Stage speed — v = Q / A_stage',
    formula: 'v = Q × 10⁶ / (60 × A_stage)',
    where: 'The smaller the stage, the faster it moves'
  }];

  if (P > 0) {
    out[0].substitution = 'F ≈ ' + vm.fmt('pressure', P) + ' × ' + area.toFixed(0) + ' × 0.1 / 1000';
    out[0].result = vm.fmtU('force', force);
  }
  if (Q > 0) {
    out[2].substitution = 'v ≈ ' + vm.fmt('flow', Q) + ' × 10⁶ / (60 × ' + area.toFixed(0) + ')';
    out[2].result = vm.fmtU('speed', speed);
  }
  return out;
}

function rotaryDocs() {
  return {
    summary: 'Rotary actuator: converts hydraulic pressure into a limited rotation (typically 90°, 180° or 270°).',
    how: 'A vane or rack-and-pinion mechanism turns the output shaft until a mechanical stop is reached. Torque depends on pressure and on the actuator displacement; the rotation speed depends on the flow. Used for steering, grapple rotation and harvester-head tilt.',
    standard: 'Circle with a curved arrow indicating limited rotation.',
    inputs: ['A — pressure inlet', 'B — return line'],
    outputs: ['Torque and rotation through a limited angle'],
    variables: [
      { symbol: 'V', name: 'Displacement per revolution', unit: 'displacement' },
      { symbol: 'T', name: 'Output torque', unit: 'torque' },
      { symbol: 'α', name: 'Swing angle', unit: 'percent' }
    ],
    tips: [
      'Always fit a cross-line relief valve: a blocked return line can destroy the actuator.',
      'The swing time depends on the flow: throttle it with a flow control valve if the movement is too abrupt.'
    ]
  };
}

function rotaryEquations(vm) {
  const angle = vm.comp.values.angle || 180;
  const P = vm.pressure || 0;
  const Q = vm.flow || 0;
  const torque = P * 25 / (20 * Math.PI);      /* modelo simplificado: 25 cm³/rev */
  const rpm = Q * 1000 / 25;
  const seconds = rpm > 0 ? (angle / 360) / (rpm / 60) : 0;

  const out = [{
    title: 'Output torque',
    formula: 'T = ΔP × V / 20π',
    where: 'ΔP in bar · V in cm³/rev · T in Nm'
  }, {
    title: 'Swing time',
    formula: 't = (α / 360°) / (n / 60)',
    where: 'α = swing angle (' + angle + '°) · n in rpm',
    notes: 'The higher the flow, the shorter the swing time.'
  }];

  if (P > 0) {
    out[0].substitution = 'T = ' + vm.fmt('pressure', P) + ' × 25 / (20 × π)';
    out[0].result = vm.fmtU('torque', torque);
  }
  if (Q > 0 && rpm > 0) {
    out[1].substitution = 't = (' + angle + ' / 360) / (' + vm.fmt('rpm', rpm) + ' / 60)';
    out[1].result = seconds.toFixed(2) + ' s';
  }
  return out;
}

export const actuators = [
  { type: 'cylinder-da', label: 'Double-Acting Cylinder', role: ROLES.ACTUATOR_LINEAR, docs: cylinderDocs(false), equations: cylinderEquations, physics: { solve: solveCylinder } },
  { type: 'cylinder-sa', label: 'Single-Acting Cylinder', role: ROLES.ACTUATOR_LINEAR, docs: cylinderDocs(true), equations: cylinderEquations, physics: { solve: solveCylinder } },
  { type: 'cylinder-telescopic', label: 'Telescopic Cylinder', role: ROLES.ACTUATOR_LINEAR, docs: telescopicDocs(), equations: telescopicEquations, physics: {} },
  { type: 'motor', label: 'Hydraulic Motor', role: ROLES.ACTUATOR_ROTARY, docs: motorDocs(), equations: motorEquations, physics: { solve: solveMotor, noConduction: true } },
  { type: 'motor-bidir', label: 'Bi-Directional Motor', role: ROLES.ACTUATOR_ROTARY, docs: motorDocs(), equations: motorEquations, physics: { solve: solveMotor, noConduction: true } },
  { type: 'poclain-ms35', label: 'Poclain MS35 LSHT Motor', role: ROLES.ACTUATOR_ROTARY, docs: poclainDocs(), equations: poclainEquations, physics: { conduct: poclain, solve: solvePoclain } },
  { type: 'rotary-act', label: 'Rotary Actuator', role: ROLES.ACTUATOR_ROTARY, docs: rotaryDocs(), equations: rotaryEquations, physics: {} }
];
