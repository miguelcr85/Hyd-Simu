// ================================================================
// PANEL DE PROPIEDADES AVANZADO
// ================================================================

import { 
    formatNumber, 
    getComponentDisplayName,
    isComponentConnected,
    getPortStatus,
    getStatusColor,
    getBarColor,
    getComponentStatus,
    isTankPort
} from './utils.js';

import { 
    getPumpPerformanceValues, 
    getPumpMetrics, 
    getPumpWarnings 
} from './pump-calculations.js';

import { 
    getCylinderPerformanceValues, 
    getCylinderMetrics, 
    getCylinderWarnings 
} from './cylinder-calculations.js';

import { 
    getPumpDrivePerformanceValues, 
    getPumpDriveMetrics, 
    getPumpDriveWarnings 
} from './pump-drive-calculations.js';

// ================================================================
// CONFIGURACIÓN
// ================================================================

const COMP_PERFORMANCE_MAP = {
    'pump-var-displacement': {
        getValues: getPumpPerformanceValues,
        getMetrics: getPumpMetrics,
        getWarnings: getPumpWarnings
    },
    'pump': {
        getValues: getPumpPerformanceValues,
        getMetrics: getPumpMetrics,
        getWarnings: getPumpWarnings
    },
    'cylinder-da': {
        getValues: getCylinderPerformanceValues,
        getMetrics: getCylinderMetrics,
        getWarnings: getCylinderWarnings
    },
    'cylinder-sa': {
        getValues: getCylinderPerformanceValues,
        getMetrics: getCylinderMetrics,
        getWarnings: getCylinderWarnings
    },
    'pump-drive': {
        getValues: getPumpDrivePerformanceValues,
        getMetrics: getPumpDriveMetrics,
        getWarnings: getPumpDriveWarnings
    }
};

// ================================================================
// ESTADO DEL PANEL
// ================================================================

let state = {
    visible: false,
    comp: null,
    activeTab: 'general',
    definitions: {},
    connections: [],
    running: false,
    updateInterval: null,
    callbacks: {
        onSave: null,
        onDraw: null,
        onCompute: null
    }
};

// Referencias DOM
let dom = {
    panel: null,
    content: null,
    title: null,
    closeBtn: null,
    tabs: []
};

// ================================================================
// INICIALIZACIÓN
// ================================================================

export function initPropertiesPanel(config) {
    state.definitions = config.definitions || {};
    state.connections = config.connections || [];
    state.running = config.running || false;
    state.callbacks.onSave = config.onSave || null;
    state.callbacks.onDraw = config.onDraw || null;
    state.callbacks.onCompute = config.onCompute || null;
    
    // Obtener referencias DOM
    dom.panel = document.getElementById('props-panel-advanced');
    dom.content = document.getElementById('props-content');
    dom.title = document.getElementById('props-title');
    dom.closeBtn = document.getElementById('props-close');
    dom.tabs = document.querySelectorAll('.props-tab');
    
    if (!dom.panel) {
        console.warn('⚠️ Panel de propiedades no encontrado en el DOM');
        return;
    }
    
    setupEventListeners();
    startAutoUpdate();
}

// ================================================================
// EVENT LISTENERS
// ================================================================

function setupEventListeners() {
    // Cerrar panel
    if (dom.closeBtn) {
        dom.closeBtn.addEventListener('click', hidePropertiesPanel);
    }
    
    // Pestañas
    if (dom.tabs && dom.tabs.length) {
        dom.tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                const tabName = this.dataset.tab;
                if (!tabName) return;
                
                dom.tabs.forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                state.activeTab = tabName;
                
                if (state.comp) {
                    renderContent(state.comp, tabName);
                }
            });
        });
    }
    
    // Cerrar con Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && state.visible) {
            hidePropertiesPanel();
        }
    });
    
    // Click fuera del panel para cerrar (opcional)
    document.addEventListener('click', function(e) {
        if (state.visible && dom.panel && !dom.panel.contains(e.target)) {
            // Solo cerrar si el click no fue en un componente del canvas
            const canvas = document.getElementById('sim-canvas');
            if (canvas && !canvas.contains(e.target)) {
                // No cerramos automáticamente para no interrumpir el flujo de trabajo
            }
        }
    });
}

// ================================================================
// ACTUALIZACIÓN AUTOMÁTICA
// ================================================================

function startAutoUpdate() {
    if (state.updateInterval) {
        clearInterval(state.updateInterval);
    }
    
    state.updateInterval = setInterval(function() {
        if (state.visible && state.comp) {
            // Actualizar datos en tiempo real
            state.running = window.running || false;
            state.connections = window.connections || [];
            renderContent(state.comp, state.activeTab);
        }
    }, 500);
}

// ================================================================
// FUNCIONES PÚBLICAS
// ================================================================

export function showPropertiesPanel(comp) {
    if (!comp) {
        hidePropertiesPanel();
        return;
    }
    
    if (!dom.panel) return;
    
    state.comp = comp;
    state.visible = true;
    state.running = window.running || false;
    state.connections = window.connections || [];
    
    const def = state.definitions[comp.type];
    dom.panel.style.display = 'flex';
    
    if (dom.title) {
        dom.title.textContent = (def ? def.name : comp.type) + ' (ID: ' + comp.id + ')';
    }
    
    // Activar pestaña general por defecto
    dom.tabs.forEach(function(tab) {
        tab.classList.toggle('active', tab.dataset.tab === 'general');
    });
    state.activeTab = 'general';
    
    renderContent(comp, 'general');
}

export function hidePropertiesPanel() {
    if (dom.panel) {
        dom.panel.style.display = 'none';
    }
    state.visible = false;
    state.comp = null;
}

export function updatePropertiesPanel(comp) {
    if (comp && state.visible && state.comp && comp.id === state.comp.id) {
        renderContent(comp, state.activeTab);
    }
}

export function togglePropertiesPanel(comp) {
    if (state.visible && state.comp === comp) {
        hidePropertiesPanel();
    } else {
        showPropertiesPanel(comp);
    }
}

// ================================================================
// RENDERIZADO PRINCIPAL
// ================================================================

function renderContent(comp, tab) {
    if (!dom.content) return;
    
    let html = '';
    
    switch (tab) {
        case 'general':
            html = renderGeneralTab(comp);
            break;
        case 'parameters':
            html = renderParametersTab(comp);
            break;
        case 'performance':
            html = renderPerformanceTab(comp);
            break;
        case 'diagnostics':
            html = renderDiagnosticsTab(comp);
            break;
        default:
            html = '<p style="color:#5a7a9a;padding:20px;text-align:center;">Selecciona una pestaña</p>';
    }
    
    dom.content.innerHTML = html;
    attachEvents(comp);
}

// ================================================================
// RENDER: PESTAÑA GENERAL
// ================================================================

function renderGeneralTab(comp) {
    const def = state.definitions[comp.type];
    const isRunning = state.running || false;
    const status = getComponentStatus(comp, isRunning);
    const connected = isComponentConnected(comp, state.connections);
    
    let html = '';
    html += '<div class="prop-section">';
    html += '<div class="prop-section-title">Estado</div>';
    html += '<div class="prop-row">';
    html += '<span class="prop-label">Estado del sistema</span>';
    html += '<span class="prop-status-badge ' + status.class + '">' + status.text + '</span>';
    html += '</div>';
    html += '<div class="prop-row">';
    html += '<span class="prop-label">Conexiones</span>';
    html += '<span class="prop-value">' + (connected ? 'Conectado' : 'Sin conexiones') + '</span>';
    html += '</div>';
    html += '<div class="prop-row">';
    html += '<span class="prop-label">Tipo</span>';
    html += '<span class="prop-value">' + (def ? def.name : comp.type) + '</span>';
    html += '</div>';
    html += '<div class="prop-row">';
    html += '<span class="prop-label">ID</span>';
    html += '<span class="prop-value">' + comp.id + '</span>';
    html += '</div>';
    html += '</div>';
    
    // Parámetros actuales
    if (def && def.params) {
        html += '<div class="prop-section">';
        html += '<div class="prop-section-title">Parámetros Actuales</div>';
        for (const key in def.params) {
            const p = def.params[key];
            const val = comp.values[key];
            if (val === undefined) continue;
            const displayVal = typeof val === 'number' ? val.toFixed(1) : val;
            html += '<div class="prop-row">';
            html += '<span class="prop-label">' + p.label + '</span>';
            html += '<span class="prop-value">' + displayVal + '</span>';
            html += '</div>';
        }
        html += '</div>';
    }
    
    return html;
}

// ================================================================
// RENDER: PESTAÑA PARÁMETROS
// ================================================================

function renderParametersTab(comp) {
    const def = state.definitions[comp.type];
    if (!def) return '<p style="color:#5a7a9a;padding:20px;text-align:center;">No hay parámetros disponibles</p>';
    
    let html = '';
    html += '<div class="prop-section">';
    html += '<div class="prop-section-title">Ajustes del Componente</div>';
    
    for (const key in def.params) {
        const p = def.params[key];
        const val = comp.values[key];
        
        if (p.type === 'select') {
            html += '<div class="prop-row" style="flex-wrap:wrap;gap:8px;">';
            html += '<span class="prop-label">' + p.label + '</span>';
            html += '<select data-param="' + key + '" style="background:#1a2535;color:#c8d8e8;border:1px solid #2a4060;border-radius:4px;padding:4px 8px;font-size:0.8rem;">';
            for (let o = 0; o < p.options.length; o++) {
                html += '<option' + (p.options[o] === val ? ' selected' : '') + '>' + p.options[o] + '</option>';
            }
            html += '</select>';
            html += '</div>';
        } else {
            const min = p.min || 0;
            const max = p.max || 100;
            const step = p.step || 1;
            const pct = Math.min(100, Math.max(0, ((val - min) / (max - min) * 100)));
            const barColor = getBarColor(pct);
            
            html += '<div class="prop-row" style="flex-wrap:wrap;gap:4px;">';
            html += '<span class="prop-label">' + p.label + '</span>';
            html += '<div style="display:flex;align-items:center;gap:8px;flex:1;">';
            html += '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" data-param="' + key + '" style="flex:1;background:#1a2535;height:4px;">';
            html += '<span class="prop-value" style="min-width:40px;text-align:right;">' + (typeof val === 'number' ? val.toFixed(1) : val) + '</span>';
            html += '<div class="prop-bar"><div class="prop-bar-fill ' + barColor + '" style="width:' + pct + '%;"></div></div>';
            html += '</div>';
            html += '</div>';
        }
    }
    html += '</div>';
    
    // Puertos
    const portStatus = getPortStatus(comp, state.connections, state.definitions);
    if (portStatus.length > 0) {
        html += '<div class="prop-section">';
        html += '<div class="prop-section-title">Puertos</div>';
        for (let i = 0; i < portStatus.length; i++) {
            const ps = portStatus[i];
            const isTank = isTankPort(comp.type, ps.label, state.definitions);
            html += '<div class="prop-row">';
            html += '<span class="prop-label">Puerto ' + ps.label + '</span>';
            html += '<span class="prop-value ' + (isTank ? 'warning' : 'info') + '">' + (isTank ? 'Retorno' : 'Presión') + '</span>';
            html += '</div>';
        }
        html += '</div>';
    }
    
    return html;
}

// ================================================================
// RENDER: PESTAÑA RENDIMIENTO
// ================================================================

function renderPerformanceTab(comp) {
    const perfConfig = COMP_PERFORMANCE_MAP[comp.type];
    
    if (!perfConfig) {
        return '<p style="color:#5a7a9a;text-align:center;padding:20px;">No hay métricas de rendimiento para este componente.</p>';
    }
    
    const values = perfConfig.getValues(comp);
    const metrics = perfConfig.getMetrics(comp);
    
    let html = '';
    html += '<div class="prop-section">';
    html += '<div class="prop-section-title">Métricas en Tiempo Real</div>';
    
    for (let i = 0; i < metrics.metrics.length; i++) {
        const metric = metrics.metrics[i];
        const label = metrics.labels[metric] || metric;
        const unit = metrics.units[metric] || '';
        let value = values[metric];
        
        if (value === undefined || value === null) {
            value = '—';
        } else {
            value = formatNumber(value);
        }
        
        // Determinar clase de color para valores numéricos
        let valueClass = 'prop-value';
        if (typeof values[metric] === 'number' && values[metric] !== undefined) {
            const numVal = values[metric];
            if (numVal > 80) valueClass += ' danger';
            else if (numVal > 60) valueClass += ' warning';
            else if (numVal > 0) valueClass += ' highlight';
        }
        
        html += '<div class="prop-row">';
        html += '<span class="prop-label">' + label + '</span>';
        html += '<span class="' + valueClass + '">' + value + ' ' + unit + '</span>';
        html += '</div>';
    }
    
    html += '</div>';
    
    // Estado de rendimiento
    html += '<div class="prop-section">';
    html += '<div class="prop-section-title">Estado de Rendimiento</div>';
    
    const status = getComponentStatus(comp, state.running);
    html += '<div class="prop-row">';
    html += '<span class="prop-label">Estado</span>';
    html += '<span class="prop-value ' + status.class + '">' + status.text + '</span>';
    html += '</div>';
    
    // Barra de eficiencia si está disponible
    if (values.torqueRatio !== undefined && values.torqueRatio > 0) {
        const eff = values.torqueRatio * 100;
        const effColor = getBarColor(eff);
        html += '<div class="prop-row">';
        html += '<span class="prop-label">Eficiencia del sistema</span>';
        html += '<span class="prop-value">' + eff.toFixed(1) + '%</span>';
        html += '</div>';
        html += '<div class="prop-row">';
        html += '<div class="prop-bar" style="width:100%;height:6px;">';
        html += '<div class="prop-bar-fill ' + effColor + '" style="width:' + eff + '%;"></div>';
        html += '</div>';
        html += '</div>';
    }
    
    html += '</div>';
    
    return html;
}

// ================================================================
// RENDER: PESTAÑA DIAGNÓSTICO
// ================================================================

function renderDiagnosticsTab(comp) {
    let html = '';
    html += '<div class="prop-section">';
    html += '<div class="prop-section-title">Diagnóstico del Componente</div>';
    
    // Estado de puertos
    const portStatus = getPortStatus(comp, state.connections, state.definitions);
    const hasUnconnected = portStatus.some(p => !p.connected);
    
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:0.78rem;color:' + (hasUnconnected ? '#ffbb33' : '#3ddc84') + ';margin-bottom:6px;">';
    html += (hasUnconnected ? '⚠️ ' : '✅ ') + 'Puertos';
    html += '</div>';
    
    for (let i = 0; i < portStatus.length; i++) {
        const ps = portStatus[i];
        html += '<div class="prop-row">';
        html += '<span class="prop-label">Puerto ' + ps.label + '</span>';
        html += '<span class="prop-value ' + (ps.connected ? 'highlight' : 'warning') + '">' + (ps.connected ? 'Conectado' : 'Sin conexión') + '</span>';
        html += '</div>';
    }
    html += '</div>';
    
    // Advertencias específicas del componente
    const perfConfig = COMP_PERFORMANCE_MAP[comp.type];
    let warnings = [];
    if (perfConfig && perfConfig.getWarnings) {
        warnings = perfConfig.getWarnings(comp);
    }
    
    // Advertencias generales
    if (!isComponentConnected(comp, state.connections)) {
        warnings.push('Componente sin conexiones — no participa en el circuito');
    }
    
    if (comp._localPressure > 300) {
        warnings.push('⚠️ Presión muy alta (>300 bar) — riesgo de daño');
    }
    
    if (warnings.length > 0) {
        html += '<div class="prop-section">';
        html += '<div class="prop-section-title" style="color:#ffbb33;">⚠️ Advertencias</div>';
        for (let w = 0; w < warnings.length; w++) {
            html += '<div class="prop-row" style="color:#ffbb33;font-size:0.8rem;">';
            html += '<span>' + warnings[w] + '</span>';
            html += '</div>';
        }
        html += '</div>';
    }
    
    // Información de rendimiento
    html += '<div class="prop-section">';
    html += '<div class="prop-section-title">Información Adicional</div>';
    
    const pressure = comp._localPressure || 0;
    const flow = comp._localFlow || 0;
    if (pressure > 0 || flow > 0) {
        html += '<div class="prop-row">';
        html += '<span class="prop-label">Presión actual</span>';
        html += '<span class="prop-value">' + pressure.toFixed(1) + ' bar</span>';
        html += '</div>';
        html += '<div class="prop-row">';
        html += '<span class="prop-label">Flujo actual</span>';
        html += '<span class="prop-value">' + flow.toFixed(1) + ' L/min</span>';
        html += '</div>';
    } else {
        html += '<div class="prop-row">';
        html += '<span class="prop-label">Estado</span>';
        html += '<span class="prop-value" style="color:#5a7a9a;">Sin actividad</span>';
        html += '</div>';
    }
    
    html += '</div>';
    html += '</div>';
    
    return html;
}

// ================================================================
// EVENTOS DE PARÁMETROS
// ================================================================

function attachEvents(comp) {
    // Selects
    const selects = dom.content.querySelectorAll('select[data-param]');
    selects.forEach(function(sel) {
        sel.removeEventListener('change', handleParamChange);
        sel.addEventListener('change', handleParamChange);
    });
    
    // Range sliders
    const ranges = dom.content.querySelectorAll('input[type="range"][data-param]');
    ranges.forEach(function(range) {
        range.removeEventListener('input', handleRangeInput);
        range.addEventListener('input', handleRangeInput);
    });
}

function handleParamChange(e) {
    const paramName = this.dataset.param;
    if (state.comp && paramName) {
        if (state.callbacks.onSave) state.callbacks.onSave();
        state.comp.values[paramName] = this.value;
        if (state.callbacks.onCompute) state.callbacks.onCompute();
        if (state.callbacks.onDraw) state.callbacks.onDraw();
    }
}

function handleRangeInput(e) {
    const paramName = this.dataset.param;
    const val = parseFloat(this.value);
    if (state.comp && paramName) {
        state.comp.values[paramName] = val;
        const valueDisplay = this.parentElement.querySelector('.prop-value');
        if (valueDisplay) {
            valueDisplay.textContent = val.toFixed(1);
        }
        if (state.callbacks.onCompute) state.callbacks.onCompute();
        if (state.callbacks.onDraw) state.callbacks.onDraw();
    }
}

// ================================================================
// EXPORTACIÓN
// ================================================================

export default {
    init: initPropertiesPanel,
    show: showPropertiesPanel,
    hide: hidePropertiesPanel,
    update: updatePropertiesPanel,
    toggle: togglePropertiesPanel
};