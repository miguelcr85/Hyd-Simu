// ================================================================
// RUTEO INTERNO DE VALVULAS DIRECCIONALES
// ================================================================
//
// Extraido 1:1 de js/app.js en la etapa E1. Para la posicion actual de la
// valvula devuelve los pares de puertos conectados internamente, o null si
// el componente no es una valvula direccional.
// ================================================================

  /*
   * Get DCV internal routing: returns pairs of connected port indices for current position.
   * DCV 4/3: ports 0=P, 1=T, 2=A, 3=B
   *   Extend:  P→A (0→2), B→T (3→1)
   *   Retract: P→B (0→3), A→T (2→1)
   *   Center:  all blocked
   * DCV 3/2: ports 0=P, 1=T, 2=A
   *   Open:   P→A (0→2)
   *   Closed: all blocked
   * 2/2 Valve: ports 0=In, 1=Out
   *   Open:   In→Out (0→1)
   *   Closed: blocked
   */
  export function getDcvRouting(comp) {
    /*
     * dcv52: 5/2-way — ports 0=P, 1=T1, 2=A, 3=T2, 4=B
     *   Extend:  P→A (0→2), B→T2 (4→3)
     *   Retract: P→B (0→4), A→T1 (2→1)
     */
    if (comp.type === 'dcv52') {
      switch (comp.values.position) {
        case 'Extend':  return [{ from: 0, to: 2 }, { from: 4, to: 3 }];
        case 'Retract': return [{ from: 0, to: 4 }, { from: 2, to: 1 }];
      }
    }
    /*
     * dcv53: 5/3-way — ports 0=P, 1=T1, 2=A, 3=T2, 4=B
     *   Extend/Retract same as dcv52; Center depends on centerType
     */
    if (comp.type === 'dcv53') {
      switch (comp.values.position) {
        case 'Extend':  return [{ from: 0, to: 2 }, { from: 4, to: 3 }];
        case 'Retract': return [{ from: 0, to: 4 }, { from: 2, to: 1 }];
        default: /* Center */
          switch (comp.values.centerType || 'Closed') {
            case 'Exhaust':  return [{ from: 2, to: 1 }, { from: 4, to: 3 }];  /* A→T1, B→T2 */
            case 'Pressure': return [{ from: 0, to: 2 }, { from: 0, to: 4 }];  /* P→A, P→B */
            default:         return [];                                           /* Closed */
          }
      }
    }
    /* dcv42: two-position 4/2 — no center, always active */
    if (comp.type === 'dcv42') {
      switch (comp.values.position) {
        case 'Extend':  return [{ from: 0, to: 2 }, { from: 3, to: 1 }]; /* P→A, B→T */
        case 'Retract': return [{ from: 0, to: 3 }, { from: 2, to: 1 }]; /* P→B, A→T */
      }
    }
    /* prop-dcv: 4/3 with command-based position (±10% dead band) */
    if (comp.type === 'prop-dcv') {
      var cmd = (comp.values && comp.values.command) || 0;
      if (cmd > 10)  return [{ from: 0, to: 2 }, { from: 3, to: 1 }]; /* Extend: P→A, B→T */
      if (cmd < -10) return [{ from: 0, to: 3 }, { from: 2, to: 1 }]; /* Retract: P→B, A→T */
      return []; /* Center / dead band — all blocked */
    }
    if (comp.type === 'dcv43') {
      switch (comp.values.position) {
        case 'Extend':  return [{ from: 0, to: 2 }, { from: 3, to: 1 }];
        case 'Retract': return [{ from: 0, to: 3 }, { from: 2, to: 1 }];
        default: /* Center — behaviour depends on center type */
          switch (comp.values.centerType || 'Closed') {
            case 'Tandem': return [{ from: 0, to: 1 }];                                         /* P→T, A/B blocked */
            case 'Open':   return [{ from: 0, to: 1 }, { from: 2, to: 1 }, { from: 3, to: 1 }]; /* all→T */
            case 'Float':  return [{ from: 2, to: 1 }, { from: 3, to: 1 }];                     /* A,B→T; P blocked */
            default:       return [];                                                             /* Closed: all blocked */
          }
      }
    }
    if (comp.type === 'dcv32') {
      return comp.values.position === 'Open' ? [{ from: 0, to: 2 }] : [];
    }
    /*
     * dcv32no: 3/2 Normally-Open — ports 0=P, 1=T, 2=A
     *   Normal  (rest):    P→A   [{from:0,to:2}]
     *   Shifted (actuated): A→T  [{from:2,to:1}]
     */
    if (comp.type === 'dcv32no') {
      return comp.values.position === 'Normal' ? [{ from: 0, to: 2 }] : [{ from: 2, to: 1 }];
    }
    if (comp.type === 'valve22') {
      return comp.values.position === 'Open' ? [{ from: 0, to: 1 }] : [];
    }
    /* valve22no: 2/2 Normally-Open — ports 0=P, 1=A
     *   Normal  (rest):    P→A  [{from:0,to:1}]
     *   Shifted (actuated): blocked []
     */
    if (comp.type === 'valve22no') {
      return comp.values.position === 'Normal' ? [{ from: 0, to: 1 }] : [];
    }
    return null; /* Not a DCV */
  }
