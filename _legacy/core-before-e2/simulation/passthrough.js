// ================================================================
// CONDUCTIVIDAD / RESTRICCIONES POR COMPONENTE
// ================================================================
//
// Extraido 1:1 de js/app.js en la etapa E1. Dado un componente, el puerto de
// entrada y las condiciones de presion/caudal, indica si el fluido puede
// atravesarlo, por que puerto sale, la caida de presion y el caudal limitado.
//
// NOTA (etapa E2): cada rama de este if-chain se convertira en el metodo
// `physics.conduct()` del ComponentSpec correspondiente.
// ================================================================

import { getDcvRouting } from './valve-routing.js';

  /*
   * Check if a component port allows flow through to another port.
   * Returns: { canFlow: bool, outPort: number or -1, pressureDrop: number, flowLimit: number }
   */
  export function getComponentPassthrough(comp, inPortIdx, pressure, flow) {
    var type = comp.type;

    /* DCV routing */
    var routing = getDcvRouting(comp);
    if (routing !== null) {
      for (var r = 0; r < routing.length; r++) {
        if (routing[r].from === inPortIdx) return { canFlow: true, outPort: routing[r].to, pressureDrop: 0, flowLimit: flow };
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Check valve: flow only In(0)→Out(1) */
    if (type === 'check') {
      if (inPortIdx === 0) return { canFlow: true, outPort: 1, pressureDrop: 0.5, flowLimit: flow };
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Pilot-operated check valve: In(0)→Out(1) always; Out(1)→In(0) only if pilot pressure */
    if (type === 'pilot-check') {
      if (inPortIdx === 0) return { canFlow: true, outPort: 1, pressureDrop: 0.5, flowLimit: flow };
      if (inPortIdx === 1) {
        /* Check if pilot port has pressure */
        var hasPilot = comp._pilotPressure > 5;
        return { canFlow: hasPilot, outPort: 0, pressureDrop: hasPilot ? 0.5 : 0, flowLimit: hasPilot ? flow : 0 };
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }
    // ============================================================
    // MOTOR POCLAIN MS35 (LSHT) - PASSTHROUGH
    // ============================================================
     if (type === 'poclain-ms35') {
    // Motor hidráulico: flujo entra por A (0) y sale por B (1)
    if (inPortIdx === 0) {
        // Flujo de A → B (sentido normal)
        var effVol = (comp.values.efficiencyVol || 92) / 100;
        var flowOut = flow * effVol;
        return { canFlow: true, outPort: 1, pressureDrop: 2, flowLimit: flowOut };
    } else if (inPortIdx === 1) {
        // Flujo de B → A (sentido inverso)
        return { canFlow: true, outPort: 0, pressureDrop: 2, flowLimit: flow };
    }
    // Puerto D (drenaje) - solo sale aceite de fuga
    if (inPortIdx === 2) {
        return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }
    return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
}

    /* Flow control valve: limits flow */
    if (type === 'flow-control') {
      var fcMax = comp.values.flow || 15;
      var limited = Math.min(flow, fcMax);
      return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: (flow - limited) * 0.5, flowLimit: limited };
    }

    /* Throttle valve: restricts flow by opening % */
    if (type === 'throttle') {
      var opening = (comp.values.opening || 50) / 100;
      var throttled = flow * opening;
      return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: pressure * (1 - opening) * 0.3, flowLimit: throttled };
    }

    /* Pressure reducing valve: limits downstream pressure */
    if (type === 'pressure-reducing') {
      var prvSet = comp.values.setting || 80;
      var outP = Math.min(pressure, prvSet);
      return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: pressure - outP, flowLimit: flow };
    }

    /* Sequence valve: blocks until pressure exceeds setting.
       Hysteresis prevents chatter: opens at setting, closes at 85% of setting. */
    if (type === 'sequence-valve') {
      var seqSet = comp.values.setting || 100;
      var seqReset = seqSet * 0.85;
      if (comp._sequenceOpen) {
        if (pressure < seqReset) comp._sequenceOpen = false;
      } else {
        if (pressure >= seqSet) comp._sequenceOpen = true;
      }
      if (comp._sequenceOpen) return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: 2, flowLimit: flow };
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Counterbalance valve: In(0)→Out(1) blocked unless pilot pressure overcomes setting */
    if (type === 'counterbalance') {
      if (inPortIdx === 1) return { canFlow: true, outPort: 0, pressureDrop: 0.5, flowLimit: flow }; /* Free flow reverse */
      var cbSet = comp.values.setting || 150;
      var pilotP = comp._pilotPressure || 0;
      /* Counterbalance opens when pilot pressure + load pressure exceeds setting */
      var canOpen = (pilotP + pressure * 0.3) >= cbSet * 0.5 || pressure >= cbSet;
      return { canFlow: canOpen, outPort: 1, pressureDrop: canOpen ? 2 : 0, flowLimit: canOpen ? flow : 0 };
    }

    /* Shuttle valve: higher-pressure input flows to output.
       Track pressures at each input port; only the winning side passes through. */
    if (type === 'shuttle') {
      if (inPortIdx === 0) comp._shuttleA = pressure;
      if (inPortIdx === 1) comp._shuttleB = pressure;
      if (inPortIdx === 0 || inPortIdx === 1) {
        var otherShuttleP = inPortIdx === 0 ? (comp._shuttleB || 0) : (comp._shuttleA || 0);
        if (pressure >= otherShuttleP) return { canFlow: true, outPort: 2, pressureDrop: 0.5, flowLimit: flow };
        return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Relief valve: opens when pressure exceeds setting, flow goes to Out(tank).
       Hysteresis: cracks at setting, reseats at 92% (simulates small blowdown band). */
    if (type === 'relief') {
      var relSet = comp.values.setting || 200;
      var relReset = relSet * 0.92;
      if (comp._reliefActive) {
        if (pressure < relReset) comp._reliefActive = false;
      } else {
        if (pressure >= relSet) comp._reliefActive = true;
      }
      if (inPortIdx === 0 && comp._reliefActive) return { canFlow: true, outPort: 1, pressureDrop: pressure, flowLimit: flow };
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Accumulator: single port, absorbs/releases flow (simplified) */
    if (type === 'accumulator') {
      var precharge = comp.values.precharge || 90;
      /* Store charging state */
      if (!comp._charge) comp._charge = 0;
      if (pressure > precharge && comp._charge < 1) {
        comp._charge = Math.min(1, comp._charge + 0.002);
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Pass-through components: filter, gauge, flow-meter, tee, cooler, heater */
    if (type === 'filter') return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: 1, flowLimit: flow };
    if (type === 'gauge') return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 }; /* Dead-end tap */
    if (type === 'flow-meter') return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: 0, flowLimit: flow };
    /* Oil cooler: pass-through with minor pressure drop; oil is cooled but flow continues */
    if (type === 'cooler') return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: 2, flowLimit: flow };
    /* Oil heater: pass-through with minor pressure drop */
    if (type === 'heater') return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: 1, flowLimit: flow };

    /* Pressure-compensated flow control: limits flow like flow-control */
    if (type === 'flow-comp') {
      var fcCompMax = comp.values.flow || 15;
      var fcCompLimited = Math.min(flow, fcCompMax);
      return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: (flow - fcCompLimited) * 0.5, flowLimit: fcCompLimited };
    }

    /* Proportional flow control: flow proportional to command % */
    if (type === 'prop-flow') {
      var pfCmd = Math.max(0, (comp.values && comp.values.command) || 50) / 100;
      var pfMax = comp.values.maxFlow || 40;
      var pfLimited = Math.min(flow, pfMax * pfCmd);
      return { canFlow: pfCmd > 0.01, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: (flow - pfLimited) * 0.5, flowLimit: pfLimited };
    }

    /* Proportional relief valve: opens at command-scaled pressure setting */
    if (type === 'prop-relief') {
      var prCmd = ((comp.values && comp.values.command) || 80) / 100;
      var prMax = (comp.values && comp.values.maxSetting) || 250;
      var prSet = prMax * prCmd;
      if (!comp._reliefActive) { if (pressure >= prSet) comp._reliefActive = true; }
      else { if (pressure < prSet * 0.92) comp._reliefActive = false; }
      if (inPortIdx === 0 && comp._reliefActive) return { canFlow: true, outPort: 1, pressureDrop: pressure, flowLimit: flow };
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Unloading valve: opens P→T when pilot pressure (port 2 / X) exceeds spring setting */
    if (type === 'unloading') {
      var ulSet = (comp.values && comp.values.setting) || 150;
      var ulPilot = comp._pilotPressure || 0;
      if (inPortIdx === 0) {
        var ulOpen = ulPilot >= ulSet;
        return { canFlow: ulOpen, outPort: 1, pressureDrop: ulOpen ? 1 : 0, flowLimit: ulOpen ? flow : 0 };
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* AND valve: both inputs (X=0, Y=1) must have pressure before output (A=2) flows */
    if (type === 'and-valve') {
      if (inPortIdx === 0) comp._andPortX = pressure;
      if (inPortIdx === 1) comp._andPortY = pressure;
      if (inPortIdx === 0 || inPortIdx === 1) {
        var andOtherP = inPortIdx === 0 ? (comp._andPortY || 0) : (comp._andPortX || 0);
        var andCanFlow = pressure > 5 && andOtherP > 5;
        return { canFlow: andCanFlow, outPort: 2, pressureDrop: 0.5, flowLimit: andCanFlow ? Math.min(pressure, andOtherP) : 0 };
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Tee: any port → other two ports (simplified: output flows to all connected) */
    if (type === 'tee') {
      /* Return first other port; the propagation will handle both */
      if (inPortIdx === 0) return { canFlow: true, outPort: -2, pressureDrop: 0, flowLimit: flow }; /* -2 = multi-out */
      if (inPortIdx === 1) return { canFlow: true, outPort: -2, pressureDrop: 0, flowLimit: flow };
      if (inPortIdx === 2) return { canFlow: true, outPort: -2, pressureDrop: 0, flowLimit: flow };
    }

    /*
     * Hydraulic Intensifier — ports: 0=P (LP in), 1=T (drain), 2=HP (high-p out)
     * Physics: P_HP = P_LP × ratio,  Q_HP = Q_LP / ratio
     * Implemented via negative pressureDrop (boost):
     *   outPressure = pressure - pressureDrop = pressure - (-(ratio-1)*pressure) = pressure × ratio
     * The T/drain port is a dead-end tap (returns to tank).
     */
    if (type === 'intensifier') {
      var intRatio = comp.values.ratio || 4;
      if (inPortIdx === 0) {
        /* LP → HP: multiply pressure, divide flow */
        var intBoost = -(intRatio - 1) * pressure; /* negative = boost */
        return { canFlow: true, outPort: 2, pressureDrop: intBoost, flowLimit: flow / intRatio };
      }
      /* Port 1 (T drain) and port 2 (HP out) as entry — not supported in this model */
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* ── Tier 4 ────────────────────────────────────────────────── */

    /* Fixed orifice: bidirectional, calibrated pressure drop (orifice equation simplified).
       ΔP ≈ flow² / (d² × 2)  [bar]  — tuned for typical hydraulic ranges. */
    if (type === 'orifice') {
      var orDiam = comp.values.diameter || 1.5;
      var orDrop = (flow * flow) / (orDiam * orDiam * 2);
      return { canFlow: true, outPort: inPortIdx === 0 ? 1 : 0, pressureDrop: orDrop, flowLimit: flow };
    }

    /* One-way flow control + free-return check.
       A(0)→B(1): throttled to setting; B(1)→A(0): free check (0.5 bar drop). */
    if (type === 'flow-check') {
      var fcSetting = comp.values.flow || 10;
      if (inPortIdx === 0) {
        /* Controlled direction A→B */
        var fcLimited = Math.min(flow, fcSetting);
        return { canFlow: true, outPort: 1, pressureDrop: (flow - fcLimited) * 0.4, flowLimit: fcLimited };
      }
      /* Free return B→A */
      return { canFlow: true, outPort: 0, pressureDrop: 0.5, flowLimit: flow };
    }

    /* Spring-loaded check valve: A(0)→B(1) opens only when pressure > cracking.
       B→A is always blocked (unidirectional). */
    if (type === 'check-spring') {
      var cracking = comp.values.cracking || 5;
      if (inPortIdx === 0) {
        if (pressure >= cracking) return { canFlow: true, outPort: 1, pressureDrop: cracking * 0.1, flowLimit: flow };
        return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* ── Tier 5 ────────────────────────────────────────────────── */

    /* Priority valve: P(0)→CF(1) first, CF gets set flow; EF(2) gets excess.
       Handled as pass-through for P→CF; BFS handles P→EF in special case below. */
    if (type === 'priority') {
      if (inPortIdx === 0) {
        var pvSetting = comp.values.setting || 15;
        var cfFlow = Math.min(flow, pvSetting);
        comp._priorityFlow = flow;    /* store for BFS special case */
        return { canFlow: true, outPort: 1, pressureDrop: 0, flowLimit: cfFlow };
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Flow divider: P(0)→A(1)+B(2) split by ratio.
       outPort=-2 triggers the BFS tee-split logic; ratio stored in comp._dividerRatioA. */
    if (type === 'flow-divider') {
      if (inPortIdx === 0) {
        comp._dividerRatioA = (comp.values.ratio || 50) / 100;
        return { canFlow: true, outPort: -2, pressureDrop: 0, flowLimit: flow };
      }
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    /* Hand pump: pressure source (seeded separately in BFS — see computeCircuit).
       As a passthrough it is transparent (no active role). */
    if (type === 'pump-hand') {
      return { canFlow: false, outPort: -1, pressureDrop: 0, flowLimit: 0 };
    }

    return { canFlow: true, outPort: -1, pressureDrop: 0, flowLimit: flow };
  }
