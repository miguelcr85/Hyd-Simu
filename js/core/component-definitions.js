// ================================================================
// CATALOGO DE COMPONENTES HIDRAULICOS (datos puros, sin DOM)
// ================================================================
//
// Extraido 1:1 de js/app.js (bloque COMP_DEFS) en la etapa E1.
// Cada entrada describe: nombre visible, tamano del simbolo ISO, puertos
// (posicion relativa + direccion + etiqueta) y parametros editables
// (slider/select con min, max, step y valor por defecto).
//
// NOTA (etapa E2): este objeto sera sustituido por el ComponentRegistry,
// donde cada familia (js/components/*.js) aporta su definicion y su fisica,
// de modo que anadir un componente sea 1 archivo + 1 registro.
// ================================================================

  export const COMP_DEFS = {
    'pump': { name: 'Power Unit', w: 90, h: 50, ports: [{ x: 45, y: 0, dir: 'up', label: 'P' }, { x: 76, y: 38, dir: 'down', label: 'T' }], params: { pressure: { label: 'Pressure (bar)', min: 50, max: 350, step: 10, def: 150 }, flow: { label: 'Flow (L/min)', min: 5, max: 100, step: 5, def: 30 } } },
    'relief': { name: 'Relief Valve', w: 40, h: 50, ports: [{ x: 20, y: 50, dir: 'down', label: 'P' }, { x: 20, y: 0, dir: 'up', label: 'T' }], params: { setting: { label: 'Setting (bar)', min: 50, max: 350, step: 10, def: 200 } } },
    'dcv43': { name: 'DCV 4/3', w: 80, h: 50, ports: [{ x: 20, y: 50, dir: 'down', label: 'P' }, { x: 60, y: 50, dir: 'down', label: 'T' }, { x: 20, y: 0, dir: 'up', label: 'A' }, { x: 60, y: 0, dir: 'up', label: 'B' }], params: { position: { label: 'Position', type: 'select', options: ['Center', 'Extend', 'Retract'], def: 'Center' }, centerType: { label: 'Center Type', type: 'select', options: ['Closed', 'Tandem', 'Open', 'Float'], def: 'Closed' }, actuationL: { label: 'Actuation (Left)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' }, actuationR: { label: 'Actuation (Right)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' } } },
    'dcv32': { name: 'DCV 3/2', w: 60, h: 50, ports: [{ x: 15, y: 50, dir: 'down', label: 'P' }, { x: 45, y: 50, dir: 'down', label: 'T' }, { x: 30, y: 0, dir: 'up', label: 'A' }], params: { position: { label: 'Position', type: 'select', options: ['Closed', 'Open'], def: 'Closed' }, actuationL: { label: 'Actuation (Left)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' }, actuationR: { label: 'Return (Right)', type: 'select', options: ['Spring', 'Detent', 'Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Spring' } } },
    'check': { name: 'Check Valve', w: 36, h: 40, ports: [{ x: 18, y: 40, dir: 'down', label: 'A' }, { x: 18, y: 0, dir: 'up', label: 'B' }], params: {} },
    'flow-control': { name: 'Flow Control', w: 40, h: 40, ports: [{ x: 20, y: 40, dir: 'down', label: 'A' }, { x: 20, y: 0, dir: 'up', label: 'B' }], params: { flow: { label: 'Max Flow (L/min)', min: 1, max: 60, step: 1, def: 15 } } },
    'cylinder-sa': { name: 'Single-Act Cyl', w: 90, h: 60, ports: [{ x: 9, y: 60, dir: 'down', label: 'A' }], params: { bore: { label: 'Bore (mm)', min: 25, max: 200, step: 5, def: 80 }, stroke: { label: 'Stroke (mm)', min: 50, max: 1000, step: 50, def: 300 } } },
    'cylinder-da': { name: 'Double-Act Cyl', w: 100, h: 60, ports: [{ x: 9, y: 60, dir: 'down', label: 'A' }, { x: 54, y: 60, dir: 'down', label: 'B' }], params: { bore: { label: 'Bore (mm)', min: 25, max: 200, step: 5, def: 80 }, rod: { label: 'Rod (mm)', min: 16, max: 100, step: 2, def: 45 }, stroke: { label: 'Stroke (mm)', min: 50, max: 1000, step: 50, def: 300 }, cushion: { label: 'End cushioning', type: 'select', options: ['None', 'Both ends'], def: 'None' } } },
    'motor': { name: 'Hyd Motor', w: 50, h: 50, ports: [{ x: 0, y: 25, dir: 'left', label: 'A' }, { x: 50, y: 25, dir: 'right', label: 'B' }], params: { displacement: { label: 'Disp (cm\u00B3/rev)', min: 5, max: 100, step: 5, def: 25 } } },
    'gauge': { name: 'Pressure Gauge', w: 44, h: 50, ports: [{ x: 22, y: 50, dir: 'down', label: 'M' }], params: {} },
    'filter': { name: 'Filter', w: 36, h: 40, ports: [{ x: 18, y: 40, dir: 'down', label: 'A' }, { x: 18, y: 0, dir: 'up', label: 'B' }], params: {} },
    'tee': { name: 'T-Connector', w: 30, h: 30, ports: [{ x: 15, y: 0, dir: 'up', label: '1' }, { x: 0, y: 15, dir: 'left', label: '2' }, { x: 30, y: 15, dir: 'right', label: '3' }], params: {} },
    'shuttle': { name: 'Shuttle Valve', w: 40, h: 40, ports: [{ x: 0, y: 20, dir: 'left', label: 'A' }, { x: 40, y: 20, dir: 'right', label: 'B' }, { x: 20, y: 0, dir: 'up', label: 'C' }], params: {} },
    'valve22': { name: '2/2 NC Valve', w: 44, h: 44, ports: [{ x: 22, y: 44, dir: 'down', label: 'P' }, { x: 22, y: 0, dir: 'up', label: 'A' }], params: { position: { label: 'Position', type: 'select', options: ['Closed', 'Open'], def: 'Closed' } } },
    'valve22no': { name: '2/2 NO Valve', w: 44, h: 44, ports: [{ x: 22, y: 44, dir: 'down', label: 'P' }, { x: 22, y: 0, dir: 'up', label: 'A' }], params: { position: { label: 'Position', type: 'select', options: ['Normal', 'Shifted'], def: 'Normal' }, actuationL: { label: 'Actuation (Left)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' }, actuationR: { label: 'Return (Right)', type: 'select', options: ['Spring', 'Detent', 'Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Spring' } } },
    'pressure-reducing': { name: 'Pressure Reducing', w: 40, h: 50, ports: [{ x: 20, y: 50, dir: 'down', label: 'P' }, { x: 20, y: 0, dir: 'up', label: 'A' }], params: { setting: { label: 'Setting (bar)', min: 20, max: 200, step: 5, def: 80 } } },
    'sequence-valve': { name: 'Sequence Valve', w: 40, h: 50, ports: [{ x: 20, y: 50, dir: 'down', label: 'P' }, { x: 20, y: 0, dir: 'up', label: 'A' }], params: { setting: { label: 'Setting (bar)', min: 30, max: 300, step: 10, def: 100 } } },
    'counterbalance': { name: 'Counterbalance', w: 44, h: 50, ports: [{ x: 22, y: 50, dir: 'down', label: 'P' }, { x: 22, y: 0, dir: 'up', label: 'A' }, { x: 44, y: 25, dir: 'right', label: 'X' }], params: { setting: { label: 'Setting (bar)', min: 50, max: 350, step: 10, def: 150 } } },
    'accumulator': { name: 'Accumulator', w: 36, h: 50, ports: [{ x: 18, y: 50, dir: 'down', label: 'P' }], params: { precharge: { label: 'Pre-charge (bar)', min: 20, max: 200, step: 10, def: 90 }, volume: { label: 'Volume (L)', min: 1, max: 50, step: 1, def: 10 } } },
    'throttle': { name: 'Throttle Valve', w: 36, h: 40, ports: [{ x: 18, y: 40, dir: 'down', label: 'A' }, { x: 18, y: 0, dir: 'up', label: 'B' }], params: { opening: { label: 'Opening (%)', min: 5, max: 100, step: 5, def: 50 } } },
    'flow-meter': { name: 'Flow Meter', w: 44, h: 56, ports: [{ x: 22, y: 56, dir: 'down', label: 'A' }, { x: 22, y: 0, dir: 'up', label: 'B' }], params: {} },
    'pilot-check': { name: 'Pilot Check', w: 44, h: 44, ports: [{ x: 22, y: 44, dir: 'down', label: 'A' }, { x: 22, y: 0, dir: 'up', label: 'B' }, { x: 44, y: 22, dir: 'right', label: 'X' }], params: {} },
    'engine': { name: 'Motor de Combustión', w: 60,   h: 50,   ports: [{ x: 30, y: 0, dir: 'up', label: 'P' }], params: { power: { label: 'Potencia (kW)', min: 5, max: 400, step: 5, def: 50 }, rpm: { label: 'RPM', min: 500, max: 3000, step: 100, def: 1500 }}},
    'pump-drive': {
  name: 'Pump Drive', 
  w: 90, 
  h: 70, 
  ports: [
    { x: 45, y: 0, dir: 'up', label: 'IN' },
    { x: 22, y: 70, dir: 'down', label: 'OUT1' },
    { x: 45, y: 70, dir: 'down', label: 'OUT2' },
    { x: 68, y: 70, dir: 'down', label: 'OUT3' }
  ],
  params: {
    ratio1: {
      label: 'Relación OUT1',
      min: 0.1,
      max: 3.0,
      step: 0.01,
      def: 1.0
    },
    ratio2: {
      label: 'Relación OUT2',
      min: 0.1,
      max: 3.0,
      step: 0.01,
      def: 1.0
    },
    ratio3: {
      label: 'Relación OUT3',
      min: 0.1,
      max: 3.0,
      step: 0.01,
      def: 1.0
    },
    numOutputs: {
      label: 'Nº Salidas',
      type: 'select',
      options: ['2', '3'],
      def: '2'
    },
    efficiency: {
      label: 'Eficiencia (%)',
      min: 80,
      max: 99,
      step: 1,
      def: 92
    },
    maxInputSpeed: {
      label: 'Vel. Máx Entrada (RPM)',
      min: 1000,
      max: 5000,
      step: 100,
      def: 3000
    },
    maxOutputSpeed: {
      label: 'Vel. Máx Salida (RPM)',
      min: 1000,
      max: 10000,
      step: 100,
      def: 6000
    },
    maxTorque: {
      label: 'Par Máximo (Nm)',
      min: 100,
      max: 3000,
      step: 50,
      def: 1500
    }
  }
},
'pump-var-displacement': {
  name: 'Bomba Variable', 
  w: 90, 
  h: 55, 
  ports: [
    { x: 45, y: 0, dir: 'up', label: 'P' },      // Salida de presión
    { x: 76, y: 38, dir: 'down', label: 'T' },   // Retorno al tanque
    { x: 0, y: 28, dir: 'left', label: 'IN' }    // Entrada de RPM (del motor/pump-drive)
  ],
  params: {
    displacement: { 
      label: 'Cilindrada (cm³/rev)', 
      min: 5, 
      max: 200, 
      step: 5, 
      def: 28 
    },
    displacementPct: { 
      label: 'Desplazamiento (%)', 
      min: 0, 
      max: 100, 
      step: 1, 
      def: 100 
    },
    maxPressure: { 
      label: 'Presión Máx (bar)', 
      min: 50, 
      max: 450, 
      step: 10, 
      def: 250 
    },
    efficiencyVol: { 
      label: 'Eficiencia Volumétrica (%)', 
      min: 75, 
      max: 98, 
      step: 1, 
      def: 92 
    },
    efficiencyMech: { 
      label: 'Eficiencia Mecánica (%)', 
      min: 75, 
      max: 98, 
      step: 1, 
      def: 90 
    }
  }
},
// En COMP_DEFS, actualiza la definición de 'poclain-ms35':
'poclain-ms35': {
    name: 'Poclain MS35',
    w: 70, 
    h: 70,
    ports: [
        { x: 0, y: 35, dir: 'left', label: 'A' },
        { x: 70, y: 35, dir: 'right', label: 'B' },
        { x: 35, y: 70, dir: 'down', label: 'D' }
    ],
    params: {
        displacement: { 
            label: 'Cilindrada (cm³/rev)', 
            min: 100, 
            max: 2000, 
            step: 25, 
            def: 875 
        },
        maxPressure: { 
            label: 'Presión Máx (bar)', 
            min: 150, 
            max: 450, 
            step: 10, 
            def: 350 
        },
        speedMax: { 
            label: 'Velocidad Máx (RPM)', 
            min: 100, 
            max: 800, 
            step: 50, 
            def: 300 
        },
        efficiencyVol: { 
            label: 'Eficiencia Volumétrica (%)', 
            min: 85, 
            max: 98, 
            step: 1, 
            def: 92 
        },
        efficiencyMech: { 
            label: 'Eficiencia Mecánica (%)', 
            min: 85, 
            max: 98, 
            step: 1, 
            def: 90 
        },
        torqueMax: { 
            label: 'Par Máx (Nm)', 
            min: 500, 
            max: 5000, 
            step: 100, 
            def: 1800 
        },
        // NUEVO PARÁMETRO: Diámetro de la rueda/esproque
        wheelDiameter: { 
            label: 'Diámetro Rueda (mm)', 
            min: 100, 
            max: 2000, 
            step: 10, 
            def: 478 
        },
        // NUEVO: Relación de transmisión (opcional, para caja de cambios)
        gearRatio: { 
            label: 'Relación Transmisión (:1)', 
            min: 1, 
            max: 10, 
            step: 0.5, 
            def: 1 
        }
    }
},
    /* ── Tier 1: Critical FluidSIM parity ────────────────────────────── */
    'reservoir': { name: 'Reservoir', w: 50, h: 40, ports: [{ x: 25, y: 0, dir: 'up', label: 'T' }], params: { volume: { label: 'Volume (L)', min: 10, max: 500, step: 10, def: 100 } } },
    'cooler': { name: 'Oil Cooler', w: 50, h: 40, ports: [{ x: 25, y: 40, dir: 'down', label: 'A' }, { x: 25, y: 0, dir: 'up', label: 'B' }], params: { effectiveness: { label: 'Effectiveness (%)', min: 20, max: 95, step: 5, def: 70 } } },
    'flow-comp': { name: 'Pressure-Comp FC', w: 44, h: 50, ports: [{ x: 22, y: 50, dir: 'down', label: 'A' }, { x: 22, y: 0, dir: 'up', label: 'B' }], params: { flow: { label: 'Set Flow (L/min)', min: 1, max: 60, step: 1, def: 15 } } },
    'pressure-switch': { name: 'Pressure Switch', w: 44, h: 44, ports: [{ x: 22, y: 44, dir: 'down', label: 'P' }], params: { threshold: { label: 'Threshold (bar)', min: 10, max: 350, step: 10, def: 100 } } },
    'and-valve': { name: 'AND Valve', w: 44, h: 40, ports: [{ x: 0, y: 20, dir: 'left', label: 'X' }, { x: 44, y: 20, dir: 'right', label: 'Y' }, { x: 22, y: 0, dir: 'up', label: 'A' }], params: {} },
    'unloading': { name: 'Unloading Valve', w: 44, h: 50, ports: [{ x: 22, y: 50, dir: 'down', label: 'P' }, { x: 22, y: 0, dir: 'up', label: 'T' }, { x: 44, y: 25, dir: 'right', label: 'X' }], params: { setting: { label: 'Setting (bar)', min: 50, max: 350, step: 10, def: 150 } } },
    'dcv42': { name: 'DCV 4/2', w: 80, h: 50, ports: [{ x: 20, y: 50, dir: 'down', label: 'P' }, { x: 60, y: 50, dir: 'down', label: 'T' }, { x: 20, y: 0, dir: 'up', label: 'A' }, { x: 60, y: 0, dir: 'up', label: 'B' }], params: { position: { label: 'Position', type: 'select', options: ['Extend', 'Retract'], def: 'Extend' }, actuationL: { label: 'Actuation (Left)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' }, actuationR: { label: 'Return (Right)', type: 'select', options: ['Spring', 'Detent', 'Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Spring' } } },
    'dcv52': { name: 'DCV 5/2', w: 100, h: 55, ports: [{ x: 50, y: 55, dir: 'down', label: 'P' }, { x: 22, y: 55, dir: 'down', label: 'T1' }, { x: 26, y: 0, dir: 'up', label: 'A' }, { x: 78, y: 55, dir: 'down', label: 'T2' }, { x: 74, y: 0, dir: 'up', label: 'B' }], params: { position: { label: 'Position', type: 'select', options: ['Extend', 'Retract'], def: 'Extend' }, actuationL: { label: 'Actuation (Left)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' }, actuationR: { label: 'Return (Right)', type: 'select', options: ['Spring', 'Detent', 'Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Spring' } } },
    'dcv53': { name: 'DCV 5/3', w: 120, h: 55, ports: [{ x: 60, y: 55, dir: 'down', label: 'P' }, { x: 24, y: 55, dir: 'down', label: 'T1' }, { x: 30, y: 0, dir: 'up', label: 'A' }, { x: 96, y: 55, dir: 'down', label: 'T2' }, { x: 90, y: 0, dir: 'up', label: 'B' }], params: { position: { label: 'Position', type: 'select', options: ['Center', 'Extend', 'Retract'], def: 'Center' }, centerType: { label: 'Center Type', type: 'select', options: ['Closed', 'Exhaust', 'Pressure'], def: 'Closed' }, actuationL: { label: 'Actuation (Left)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' }, actuationR: { label: 'Actuation (Right)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' } } },

    /* ── Sprint 3 additions ────────────────────────────────────────────── */
    'dcv32no': { name: 'DCV 3/2 NO', w: 60, h: 50, ports: [{ x: 15, y: 50, dir: 'down', label: 'P' }, { x: 45, y: 50, dir: 'down', label: 'T' }, { x: 30, y: 0, dir: 'up', label: 'A' }], params: { position: { label: 'Position', type: 'select', options: ['Normal', 'Shifted'], def: 'Normal' }, actuationL: { label: 'Actuation (Left)', type: 'select', options: ['Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Solenoid' }, actuationR: { label: 'Return (Right)', type: 'select', options: ['Spring', 'Detent', 'Solenoid', 'Pilot', 'Lever', 'Manual', 'Roller'], def: 'Spring' } } },
    'intensifier': { name: 'Intensifier', w: 60, h: 50, ports: [{ x: 15, y: 50, dir: 'down', label: 'P' }, { x: 45, y: 50, dir: 'down', label: 'T' }, { x: 45, y: 0, dir: 'up', label: 'HP' }], params: { ratio: { label: 'Ratio (:1)', min: 2, max: 20, step: 1, def: 4 } } },

    /* ── Tier 2: Modern / proportional components ────────────────────── */
    'rotary-act': { name: 'Rotary Actuator', w: 50, h: 50, ports: [{ x: 0, y: 25, dir: 'left', label: 'A' }, { x: 50, y: 25, dir: 'right', label: 'B' }], params: { angle: { label: 'Swing (\u00B0)', min: 90, max: 360, step: 90, def: 180 }, torque: { label: 'Torque (Nm)', min: 10, max: 2000, step: 10, def: 200 } } },
    'prop-dcv': { name: 'Prop. DCV 4/3', w: 90, h: 50, ports: [{ x: 20, y: 50, dir: 'down', label: 'P' }, { x: 70, y: 50, dir: 'down', label: 'T' }, { x: 20, y: 0, dir: 'up', label: 'A' }, { x: 70, y: 0, dir: 'up', label: 'B' }], params: { command: { label: 'Command (%)', min: -100, max: 100, step: 5, def: 0 } } },
    'prop-relief': { name: 'Prop. Relief', w: 44, h: 50, ports: [{ x: 22, y: 50, dir: 'down', label: 'P' }, { x: 22, y: 0, dir: 'up', label: 'T' }], params: { maxSetting: { label: 'Max (bar)', min: 100, max: 350, step: 10, def: 250 }, command: { label: 'Command (%)', min: 0, max: 100, step: 5, def: 80 } } },
    'prop-flow': { name: 'Prop. Flow Ctrl', w: 44, h: 50, ports: [{ x: 22, y: 50, dir: 'down', label: 'A' }, { x: 22, y: 0, dir: 'up', label: 'B' }], params: { maxFlow: { label: 'Max (L/min)', min: 10, max: 100, step: 5, def: 40 }, command: { label: 'Command (%)', min: 0, max: 100, step: 5, def: 50 } } },
    'pump-var': { name: 'Variable Pump', w: 90, h: 50, ports: [{ x: 45, y: 0, dir: 'up', label: 'P' }, { x: 76, y: 38, dir: 'down', label: 'T' }], params: { maxPressure: { label: 'Max P (bar)', min: 100, max: 350, step: 10, def: 250 }, maxFlow: { label: 'Max Q (L/min)', min: 10, max: 150, step: 5, def: 60 }, displacement: { label: 'Displ. (%)', min: 0, max: 100, step: 5, def: 100 } } },
    'motor-bidir': { name: 'Bi-Dir. Motor', w: 50, h: 50, ports: [{ x: 0, y: 25, dir: 'left', label: 'A' }, { x: 50, y: 25, dir: 'right', label: 'B' }], params: { displacement: { label: 'Disp (cm\u00B3/rev)', min: 5, max: 100, step: 5, def: 25 } } },

    /* ── Tier 3: Extended measurement & accessories ──────────────────── */
    'temp-gauge': { name: 'Temp Gauge', w: 44, h: 50, ports: [{ x: 22, y: 50, dir: 'down', label: 'T' }], params: {} },
    'heater': { name: 'Oil Heater', w: 50, h: 40, ports: [{ x: 25, y: 40, dir: 'down', label: 'A' }, { x: 25, y: 0, dir: 'up', label: 'B' }], params: { power: { label: 'Power (kW)', min: 0.5, max: 20, step: 0.5, def: 3 } } },
    'pressure-transducer': { name: 'P Transducer', w: 44, h: 50, ports: [{ x: 22, y: 50, dir: 'down', label: 'P' }], params: { range: { label: 'Range (bar)', min: 100, max: 400, step: 50, def: 250 } } },
    'cylinder-telescopic': { name: 'Telescopic Cyl', w: 120, h: 30, ports: [{ x: 0, y: 15, dir: 'left', label: 'A' }], params: { bore: { label: 'Bore (mm)', min: 50, max: 250, step: 10, def: 120 }, stages: { label: 'Stages', min: 2, max: 4, step: 1, def: 3 }, stroke: { label: 'Total Stroke (mm)', min: 500, max: 3000, step: 100, def: 1500 } } },
    'limit-switch-hyd': { name: 'Limit Switch', w: 50, h: 40, ports: [], params: { linkedCylinder: { label: 'Linked Cyl ID', min: 0, max: 999, step: 1, def: 0 }, triggerAt: { label: 'Trigger (%)', min: 50, max: 100, step: 5, def: 95 } } },

    /* ── Tier 4: FluidSIM parity extras ──────────────────────────────── */
    'orifice':     { name: 'Fixed Orifice',    w: 36, h: 40, ports: [{ x: 18, y: 40, dir: 'down', label: 'A' }, { x: 18, y: 0, dir: 'up', label: 'B' }], params: { diameter: { label: 'Diameter (mm)', min: 0.5, max: 5, step: 0.5, def: 1.5 } } },
    'flow-check':  { name: 'Flow Ctrl+Check',  w: 44, h: 44, ports: [{ x: 22, y: 44, dir: 'down', label: 'A' }, { x: 22, y: 0, dir: 'up', label: 'B' }], params: { flow: { label: 'Set Flow (L/min)', min: 1, max: 60, step: 1, def: 10 } } },
    'check-spring': { name: 'Spring Check',    w: 36, h: 50, ports: [{ x: 18, y: 50, dir: 'down', label: 'A' }, { x: 18, y: 0, dir: 'up', label: 'B' }], params: { cracking: { label: 'Cracking P (bar)', min: 0.5, max: 30, step: 0.5, def: 5 } } },

    /* ── Tier 5: Advanced flow control ───────────────────────────────── */
    'priority':    { name: 'Priority Valve',   w: 50, h: 50, ports: [{ x: 25, y: 50, dir: 'down', label: 'P' }, { x: 10, y: 0, dir: 'up', label: 'CF' }, { x: 40, y: 0, dir: 'up', label: 'EF' }], params: { setting: { label: 'CF Flow (L/min)', min: 1, max: 80, step: 1, def: 15 } } },
    'flow-divider': { name: 'Flow Divider',    w: 50, h: 50, ports: [{ x: 25, y: 50, dir: 'down', label: 'P' }, { x: 10, y: 0, dir: 'up', label: 'A' }, { x: 40, y: 0, dir: 'up', label: 'B' }], params: { ratio: { label: 'Split A (%)', min: 10, max: 90, step: 5, def: 50 } } },
    'pump-hand':   { name: 'Hand Pump',        w: 60, h: 50, ports: [{ x: 15, y: 50, dir: 'down', label: 'T' }, { x: 45, y: 0, dir: 'up', label: 'P' }], params: { pressure: { label: 'Pressure (bar)', min: 10, max: 200, step: 10, def: 50 }, flow: { label: 'Flow (L/min)', min: 0.5, max: 10, step: 0.5, def: 2 } } }
  };
