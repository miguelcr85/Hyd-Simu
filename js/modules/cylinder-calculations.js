// ================================================================
// CÁLCULOS ESPECÍFICOS DE CILINDROS
// ================================================================

import { formatNumber } from './utils.js';

export function getCylinderPerformanceValues(comp) {
    const values = {};
    
    if (comp.type === 'cylinder-da' || comp.type === 'cylinder-sa') {
        const bore = comp.values?.bore || 80;
        const rod = comp.values?.rod || 45;
        const pressure = comp._localPressure || 0;  // ← Usar _localPressure
        const aBore = Math.PI / 4 * bore * bore;
        const aAnn = Math.PI / 4 * (bore * bore - rod * rod);
        
        values.pressure = pressure;
        values.forceExtend = pressure * 0.1 * aBore / 1000;
        values.forceRetract = pressure * 0.1 * aAnn / 1000;
        values.speed = (comp._speedFactor || 0) * 100;
        values.stroke = comp.values?.stroke || 0;
        values.extension = (comp.extension || 0) * 100;
        values.bore = bore;
        values.rod = rod;
        values.areaRatio = aBore / (aAnn || 1);
        values.volume = aBore * (comp.values?.stroke || 0) / 1e6;
    }
    
    return values;
}

export function getCylinderMetrics() {
    return {
        metrics: ['pressure', 'forceExtend', 'forceRetract', 'speed', 'extension', 'stroke', 'areaRatio', 'volume'],
        labels: {
            pressure: 'Presión',
            forceExtend: 'Fuerza de extensión',
            forceRetract: 'Fuerza de retracción',
            speed: 'Velocidad',
            extension: 'Extensión',
            stroke: 'Carrera',
            areaRatio: 'Relación de áreas',
            volume: 'Volumen'
        },
        units: {
            pressure: 'bar',
            forceExtend: 'kN',
            forceRetract: 'kN',
            speed: 'mm/s',
            extension: '%',
            stroke: 'mm',
            areaRatio: '',
            volume: 'L'
        }
    };
}

export function getCylinderWarnings(comp) {
    const warnings = [];
    
    // Verificar si el cilindro está en los extremos de carrera
    const extension = comp.extension || 0;
    if (extension >= 0.99) {
        warnings.push('⚠️ Cilindro completamente extendido');
    }
    if (extension <= 0.01) {
        warnings.push('⚠️ Cilindro completamente retraído');
    }
    
    // Verificar fuerza
    const bore = comp.values?.bore || 80;
    const pressure = comp._localPressure || 0;
    const aBore = Math.PI / 4 * bore * bore;
    const force = pressure * 0.1 * aBore / 1000;
    if (force > 500) {
        warnings.push('⚠️ Fuerza muy alta (' + force.toFixed(0) + ' kN) — verificar estructura');
    }
    
    // Verificar velocidad
    const speed = (comp._speedFactor || 0) * 100;
    if (speed > 80) {
        warnings.push('⚠️ Velocidad alta — posible cavitación en la succión');
    }
    
    // Verificar presión en ambos lados (para DA)
    if (comp.type === 'cylinder-da') {
        const pressureA = comp._pressureA || 0;
        const pressureB = comp._pressureB || 0;
        if (pressureA > 0 && pressureB > 0 && Math.abs(pressureA - pressureB) < 5) {
            warnings.push('⚠️ Presiones iguales en ambos lados — cilindro bloqueado');
        }
    }
    
    return warnings;
}