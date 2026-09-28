// ================================================================
// UTILIDADES COMPARTIDAS
// ================================================================

export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function formatNumber(value, decimals = 1) {
    if (value === undefined || value === null || !isFinite(value)) return '—';
    return typeof value === 'number' ? value.toFixed(decimals) : value;
}

export function getComponentDisplayName(comp, definitions) {
    const def = definitions && definitions[comp.type];
    return def ? def.name : comp.type;
}

export function isComponentConnected(comp, connections) {
    if (!connections || !connections.length) return false;
    return connections.some(function(c) {
        return c.from.compId === comp.id || c.to.compId === comp.id;
    });
}

export function getPortStatus(comp, connections, definitions) {
    const def = definitions && definitions[comp.type];
    if (!def) return [];
    
    const connectedPorts = {};
    connections.forEach(function(c) {
        connectedPorts[c.from.compId + ':' + c.from.portIdx] = true;
        connectedPorts[c.to.compId + ':' + c.to.portIdx] = true;
    });
    
    return def.ports.map(function(port, idx) {
        return {
            label: port.label,
            connected: connectedPorts[comp.id + ':' + idx] || false
        };
    });
}

export function getStatusColor(value, thresholds) {
    thresholds = thresholds || { good: 70, warning: 50 };
    if (value >= thresholds.good) return 'highlight';
    if (value >= thresholds.warning) return 'warning';
    return 'danger';
}

export function getBarColor(value, thresholds) {
    thresholds = thresholds || { good: 70, warning: 50 };
    if (value >= thresholds.good) return 'green';
    if (value >= thresholds.warning) return 'yellow';
    return 'red';
}

export function getComponentStatus(comp, running) {
    if (!running) return { text: 'Detenido', class: 'stopped' };
    
    const pressure = comp._localPressure || 0;
    const flow = comp._localFlow || 0;
    
    if (pressure > 0 && flow > 0) return { text: 'Óptimo', class: 'running' };
    if (pressure > 0 && flow === 0) return { text: 'Atención', class: 'warning' };
    return { text: 'Inactivo', class: 'stopped' };
}

export function isTankPort(compType, portLabel, definitions) {
    if (!portLabel) return false;
    
    // Pump / variable-displacement pump: T is return-side feed FROM tank
    if (compType === 'pump' || compType === 'pump-var' || compType === 'pump-var-displacement') {
        return portLabel === 'T';
    }
    // Reservoir: its single port IS the tank connection
    if (compType === 'reservoir') return true;
    // Relief-style valves drain to tank
    if (compType === 'relief' || compType === 'unloading' || compType === 'prop-relief') {
        return portLabel === 'T';
    }
    // DCVs have a T return port
    if (compType === 'dcv43' || compType === 'dcv42' || compType === 'dcv32' || 
        compType === 'dcv32no' || compType === 'prop-dcv') {
        return portLabel === 'T';
    }
    // Intensifier drain port
    if (compType === 'intensifier') return portLabel === 'T';
    // Hand pump suction/tank side
    if (compType === 'pump-hand') return portLabel === 'T';
    // 5-port DCVs have two exhaust ports T1 and T2
    if (compType === 'dcv52' || compType === 'dcv53') {
        return portLabel === 'T1' || portLabel === 'T2';
    }
    // Pressure/sequence/counterbalance external drain
    if (compType === 'sequence-valve' || compType === 'pressure-reducing' || compType === 'counterbalance') {
        return portLabel === 'T';
    }
    return false;
}