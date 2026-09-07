var lastFetchedData = [];
var statsTimeWindow = 'all'; // default 'all' (All time history)
var statsActivityType = 'all'; // default 'all' (UDP + TCP sessions)

async function fetchData() {
    try {
        const response = await fetch('data.json?t=' + Date.now());
        const data = await response.json();
        lastFetchedData = data;
        render(data);
        updateStatistics();
        updateWeeklySummary();
    } catch (error) {
        console.error('Error al cargar los datos:', error);
    }
}

function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    let str = "";
    if (hrs > 0) str += hrs + "h ";
    if (mins > 0 || hrs > 0) str += mins + "m ";
    str += secs + "s";
    return str;
}

// Helper to get live duration of a session
function getSessionLiveDuration(session) {
    if (session.end === '🟢 Activa') {
        const ahora = Math.floor(Date.now() / 1000);
        return Math.max(0, ahora - session.start_epoch);
    }
    return session.duration_sec || 0;
}

// Helpers for time averaging
function getSecondsSinceMidnight(date) {
    return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function formatTimeFromSeconds(seconds) {
    const hrs24 = Math.floor(seconds / 3600) % 24;
    const mins = Math.floor((seconds % 3600) / 60);
    const ampm = hrs24 >= 12 ? 'PM' : 'AM';
    let hrs12 = hrs24 % 12;
    if (hrs12 === 0) hrs12 = 12;
    return `${hrs12}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

function sortDaysByEpoch(sessionsByDay) {
    return Object.keys(sessionsByDay).sort((a, b) => {
        const epochA = Math.max(...(sessionsByDay[a]?.map(s => s.start_epoch || 0) || [0]));
        const epochB = Math.max(...(sessionsByDay[b]?.map(s => s.start_epoch || 0) || [0]));
        return epochB - epochA;
    });
}
window.sortDaysByEpoch = sortDaysByEpoch;

function updateGeminiDeeplink(containerId, timeframeLabel, totalSeconds) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const link = container.querySelector('#gemini-analysis-link');
    
    // Unique message IDs per tab
    const noDataId = (containerId === 'tab-weekly') ? 'gemini-no-data-weekly' : 'gemini-no-data-stats';
    const noDataMsg = document.getElementById(noDataId);
    
    if (!link) return;

    if (totalSeconds === 0) {
        link.style.display = 'none';
        if (noDataMsg) noDataMsg.style.display = 'block';
        return;
    }

    link.style.display = 'inline-block';
    if (noDataMsg) noDataMsg.style.display = 'none';

    const totalHours = (totalSeconds / 3600).toFixed(1) + " horas";
    const prompt = `Analiza los hábitos de juego de un adolescente para el periodo ${timeframeLabel}, donde ha jugado un total de ${totalHours}. 
A partir de estos datos, proporciona un análisis detallado respondiendo:
- ¿Qué desafíos futuros (sociales, académicos, de salud) enfrentará si mantiene estos hábitos?
- ¿Cómo se compara este tiempo de juego con el promedio de su edad? Indica el percentil de normalidad (ej. 1 de cada 1000 adolescentes juegan tanto).
- Muestra una comparativa de lo que podría haber alcanzado en este mismo tiempo si lo hubiera dedicado a actividades productivas o aprendizaje de habilidades. Usa ejemplos concretos de figuras históricas o contemporáneas exitosas que dedicaron tiempos similares a sus pasiones (menciona la regla de las 10,000 horas de Gladwell para la maestría).
Utiliza un tono empático y fácil de entender para alguien sin formación científica, pero incluye citas académicas y referencias a estudios científicos que respalden tus afirmaciones. Responde íntegramente en español.`;

    // Google Search AI Mode (udm=50)
    link.href = `https://www.google.com/search?udm=50&q=${encodeURIComponent(prompt)}`;
}

// Start of current week (Monday 00:00:00)
function getStartOfCurrentWeek() {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay(); // 0 = Sun, 1 = Mon, etc.
    const diff = day === 0 ? 6 : day - 1;
    startOfWeek.setDate(now.getDate() - diff);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
}

// Start of current month (1st of month 00:00:00)
function getStartOfCurrentMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

var weeklyOffset = 0;

// Tab switcher globally accessible for JSDOM and inline html onclick
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabId === 'history') {
        document.getElementById('tab-btn-history').classList.add('active');
        document.getElementById('tab-history').classList.add('active');
    } else if (tabId === 'weekly') {
        document.getElementById('tab-btn-weekly').classList.add('active');
        document.getElementById('tab-weekly').classList.add('active');
        updateWeeklySummary();
    } else if (tabId === 'stats') {
        document.getElementById('tab-btn-stats').classList.add('active');
        document.getElementById('tab-stats').classList.add('active');
    }
};

window.changeWeek = function(offset) {
    weeklyOffset += offset;
    updateWeeklySummary();
};

window.getLogicalDayString = function(epoch) {
    const dt = new Date(epoch * 1000);
    // 5 AM rollover
    if (dt.getHours() < 5) {
        dt.setDate(dt.getDate() - 1);
    }
    return dt.toISOString().split('T')[0];
};

window.getShift = function(epoch) {
    const dt = new Date(epoch * 1000);
    const h = dt.getHours();
    if (h >= 5 && h < 14) return 'morning';
    return 'afternoon';
};

window.getWeeklyRange = function(offset) {
    const now = new Date();
    // Monday at 5 AM
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay(); // 0 is Sunday, 1 is Monday
    const diff = (day === 0 ? -6 : 1 - day); // Distance to Monday
    startOfWeek.setDate(startOfWeek.getDate() + diff + (offset * 7));
    startOfWeek.setHours(5, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7); // Next Monday 5 AM

    return { start: startOfWeek, end: endOfWeek };
};

function updateWeeklySummary() {
    const grid = document.getElementById('weekly-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const range = window.getWeeklyRange(weeklyOffset);
    const startEpoch = range.start.getTime() / 1000;
    const endEpoch = range.end.getTime() / 1000;

    // Update Label
    const label = document.getElementById('weekly-range-label');
    if (label) {
        const options = { day: 'numeric', month: 'short' };
        label.innerText = `Semana del ${range.start.toLocaleDateString('es-ES', options)} al ${new Date(range.end.getTime() - 1000).toLocaleDateString('es-ES', options)}`;
    }

    // Filter sessions in range
    const weeklySessions = lastFetchedData.filter(s => s.start_epoch >= startEpoch && s.start_epoch < endEpoch);

    // Group by logical day
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(range.start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        days.push({
            dateStr: dateStr,
            display: d.toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase(),
            dateFmt: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            morning: { start: null, end: null, duration: 0, devices: new Set() },
            afternoon: { start: null, end: null, duration: 0, devices: new Set() },
            total: 0
        });
    }

    let weeklyTotalSecs = 0;

    weeklySessions.forEach(session => {
        const logicalDay = window.getLogicalDayString(session.start_epoch);
        const shift = window.getShift(session.start_epoch);
        const duration = getSessionLiveDuration(session);
        
        const dayData = days.find(d => d.dateStr === logicalDay);
        if (dayData) {
            const sData = dayData[shift];
            if (sData.start === null || session.start_epoch < sData.start) sData.start = session.start_epoch;
            
            // End time
            let endEpoch = session.start_epoch + session.duration_sec;
            if (session.end === '🟢 Activa') endEpoch = Math.floor(Date.now() / 1000);
            if (sData.end === null || endEpoch > sData.end) sData.end = endEpoch;
            
            sData.duration += duration;
            dayData.total += duration;
            weeklyTotalSecs += duration;
            sData.devices.add(session.device);
        }
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Render cards
    days.forEach(day => {
        const card = document.createElement('div');
        card.className = 'stats-card weekly-day-card';
        
        const isFuture = day.dateStr > todayStr;
        
        const renderShift = (title, data) => {
            if (data.duration === 0) {
                const statusText = isFuture ? 'Pendiente' : 'Sin actividad';
                return `<div class="shift-block"><div class="shift-title">${title}</div><div class="shift-metrics">${statusText}</div></div>`;
            }
            
            const startStr = formatTimeFromSeconds(getSecondsSinceMidnight(new Date(data.start * 1000)));
            const endStr = formatTimeFromSeconds(getSecondsSinceMidnight(new Date(data.end * 1000)));
            
            let deviceIcons = '';
            if (data.devices.has('PC')) deviceIcons += '<span title="Jugado en PC">💻</span>';
            if (data.devices.has('Phone')) deviceIcons += '<span title="Jugado en Celular">📱</span>';

            return `
                <div class="shift-block">
                    <div class="shift-title">${title}</div>
                    <div class="shift-metrics">
                        <span>🕒 ${startStr} - ${endStr}</span>
                        <span>⏳ ${formatDuration(data.duration)}</span>
                        <div class="shift-devices">${deviceIcons}</div>
                    </div>
                </div>
            `;
        };

        card.innerHTML = `
            <div class="weekly-day-header">
                <span class="weekly-day-name">${day.display}</span>
                <span class="weekly-day-date">${day.dateFmt}</span>
            </div>
            ${renderShift('🌅 MAÑANA', day.morning)}
            ${renderShift('🌇 TARDE / NOCHE', day.afternoon)}
            <div class="day-total-footer">
                Total: ${formatDuration(day.total)}
            </div>
        `;
        grid.appendChild(card);
    });

    const weeklyTotalEl = document.getElementById('stat-weekly-total-hours');
    if (weeklyTotalEl) {
        weeklyTotalEl.innerText = formatDuration(weeklyTotalSecs);
    }

    const rangeLabel = document.getElementById('weekly-range-label') ? document.getElementById('weekly-range-label').innerText : "esta semana";
    updateGeminiDeeplink('tab-weekly', rangeLabel, weeklyTotalSecs);
}

// Filter setters
window.setStatsTimeWindow = function(days) {
    statsTimeWindow = days;
    document.querySelectorAll('#time-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
    
    if (days === 30) document.getElementById('time-btn-30').classList.add('active');
    else if (days === 90) document.getElementById('time-btn-90').classList.add('active');
    else if (days === 365) document.getElementById('time-btn-365').classList.add('active');
    else if (days === 'all') document.getElementById('time-btn-all').classList.add('active');
    
    updateStatistics();
};

window.setStatsActivityType = function(type) {
    statsActivityType = type;
    document.querySelectorAll('#type-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
    
    if (type === 'all') document.getElementById('type-btn-all').classList.add('active');
    else if (type === 'game') document.getElementById('type-btn-game').classList.add('active');
    
    updateStatistics();
};

function render(data) {
    const dashboard = document.getElementById('dashboard');
    dashboard.innerHTML = '';

    if (!data || data.length === 0) {
        dashboard.innerHTML = '<div class="day-card"><p style="text-align:center;">No hay sesiones registradas aún.</p></div>';
        return;
    }

    // Group by day
    const sessionsByDay = {};
    data.forEach(session => {
        if (!sessionsByDay[session.date]) {
            sessionsByDay[session.date] = [];
        }
        sessionsByDay[session.date].push(session);
    });

    // Sort days descending (reverse chronological: newest date first)
    const sortedDays = sortDaysByEpoch(sessionsByDay);

    sortedDays.forEach(day => {
        // Sort sessions in reverse chronological order within each day (latest session first)
        sessionsByDay[day].sort((a, b) => (b.start_epoch || 0) - (a.start_epoch || 0));

        const card = document.createElement('div');
        card.className = 'day-card';

        // Title with dedicated daily total gameplay span
        const title = document.createElement('h2');
        title.className = 'day-title';
        title.innerHTML = `
            ${day} 
            <div class="day-totals-container">
                <span class="day-total active-play" data-day="${day}" data-type="active">🎮 En Juego Activo: -</span>
                <span class="day-total aggregate-play" data-day="${day}" data-type="aggregate">👨‍💻 Total En Juego: -</span>
            </div>
        `;
        card.appendChild(title);

        const table = document.createElement('table');
        table.innerHTML = `
            <tr>
                <th>Dispositivo</th>
                <th>Tipo de Actividad</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Tiempo</th>
            </tr>
        `;

        sessionsByDay[day].forEach(session => {
            const row = document.createElement('tr');
            
            let deviceHtml = '';
            if (session.device === 'Phone') deviceHtml = '<span class="device">📱 Celular</span>';
            else if (session.device === 'PC') deviceHtml = '<span class="device">💻 PC</span>';
            else deviceHtml = `<span class="device">❓ ${session.device}</span>`;

            let typeHtml = '';
            if (session.proto === 'UDP') typeHtml = '<span class="type-gameplay">🎮 En Juego Activo</span>';
            else typeHtml = '<span class="type-menu">👨‍💻 Total En Juego</span>';

            const isActive = session.end === '🟢 Activa';
            const durationHtml = isActive 
                ? `<td class="duration active-duration" data-start="${session.start_epoch}">...</td>`
                : `<td class="duration">${session.duration_str}</td>`;

            row.innerHTML = `
                <td>${deviceHtml}</td>
                <td>${typeHtml}</td>
                <td>${session.start_time_fmt}</td>
                <td>${session.end === '🟢 Activa' ? '🟢 Activa' : session.end_time_fmt}</td>
                ${durationHtml}
            `;
            table.appendChild(row);
        });

        card.appendChild(table);
        dashboard.appendChild(card);
    });

    updateActiveTimes();
}

function updateActiveTimes() {
    const activeCells = document.querySelectorAll('.active-duration');
    const now = Math.floor(Date.now() / 1000);
    
    activeCells.forEach(cell => {
        const startStr = cell.getAttribute('data-start');
        if (!startStr) return;
        
        const startEpoch = parseInt(startStr, 10);
        let duration = now - startEpoch;
        if (duration < 0) duration = 0;
        
        cell.innerText = formatDuration(duration);
    });

    // Automatically recalculate day totals and statistics on every second to allow live-ticking active sessions
    updateDayTotals();
    updateStatistics();
    updateWeeklySummary();
}

function updateDayTotals() {
    const activeTotals = {};
    const aggregateTotals = {};
    
    lastFetchedData.forEach(session => {
        const day = session.date;
        if (!activeTotals[day]) activeTotals[day] = 0;
        if (!aggregateTotals[day]) aggregateTotals[day] = 0;
        
        const duration = getSessionLiveDuration(session);
        aggregateTotals[day] += duration;
        if (session.proto === 'UDP') {
            activeTotals[day] += duration;
        }
    });

    document.querySelectorAll('.day-total').forEach(span => {
        const day = span.getAttribute('data-day');
        const type = span.getAttribute('data-type');
        if (type === 'active') {
            const sec = activeTotals[day] || 0;
            span.innerText = `🎮 En Juego Activo: ${formatDuration(sec)}`;
        } else {
            const sec = aggregateTotals[day] || 0;
            span.innerText = `👨‍💻 Total En Juego: ${formatDuration(sec)}`;
        }
    });
}

function updateStatistics() {
    if (!lastFetchedData || lastFetchedData.length === 0) {
        resetStatsDisplay();
        return;
    }

    // 1. Get filtered list of sessions
    const now = new Date();
    let cutoffTime = 0;
    if (statsTimeWindow !== 'all') {
        const cutoffDate = new Date();
        cutoffDate.setDate(now.getDate() - statsTimeWindow);
        cutoffDate.setHours(0, 0, 0, 0);
        cutoffTime = cutoffDate.getTime();
    }

    let totalSecs = 0;
    const filtered = lastFetchedData.filter(session => {
        if (statsTimeWindow !== 'all' && (session.start_epoch * 1000 < cutoffTime)) {
            return false;
        }
        if (statsActivityType === 'game' && session.proto !== 'UDP') {
            return false;
        }
        totalSecs += getSessionLiveDuration(session);
        return true;
    });

    // Display total hours
    const totalHoursEl = document.getElementById('stat-total-hours');
    if (totalHoursEl) {
        totalHoursEl.innerText = formatDuration(totalSecs);
    }

    let timeframeLabel = "todo el historial";
    if (statsTimeWindow !== 'all') {
        timeframeLabel = `los últimos ${statsTimeWindow} días`;
    }
    updateGeminiDeeplink('tab-stats', timeframeLabel, totalSecs);

    if (filtered.length === 0) {
        resetStatsDisplay();
        return;
    }

    // 2. Calculate Average Weekly hours
    let weeksCount = 1;
    if (statsTimeWindow !== 'all') {
        weeksCount = statsTimeWindow / 7;
    } else {
        const earliestEpoch = Math.min(...filtered.map(s => s.start_epoch));
        const spanMs = Date.now() - (earliestEpoch * 1000);
        const spanDays = spanMs / (1000 * 3600 * 24);
        weeksCount = Math.max(1, spanDays / 7);
    }

    const totalSecondsFiltered = filtered.reduce((sum, s) => sum + getSessionLiveDuration(s), 0);
    const avgHoursPerWeek = (totalSecondsFiltered / 3600) / weeksCount;
    document.getElementById('stat-weekly-hours-avg').innerText = avgHoursPerWeek.toFixed(1) + " horas / semana";

    // 3. Daily Breakdown Logical Math with 5 AM and Midnight Rollover Rules
    const groups = {
        'mon-thu': { startSum: 0, startCount: 0, endSum: 0, endCount: 0, playByDay: {} },
        'fri': { startSum: 0, startCount: 0, endSum: 0, endCount: 0, playByDay: {} },
        'sat': { startSum: 0, startCount: 0, endSum: 0, endCount: 0, playByDay: {} },
        'sun': { startSum: 0, startCount: 0, endSum: 0, endCount: 0, playByDay: {} }
    };

    filtered.forEach(session => {
        const liveDuration = getSessionLiveDuration(session);
        const startCalDate = new Date(session.start_epoch * 1000);
        const startHour = startCalDate.getHours();

        // Rollover: If starts before 5 AM, logical day is previous day
        const logicalMidnight = new Date(startCalDate);
        if (startHour < 5) {
            logicalMidnight.setDate(logicalMidnight.getDate() - 1);
        }
        logicalMidnight.setHours(0, 0, 0, 0);

        const logicalDayOfWeek = logicalMidnight.getDay(); // 0 = Sun, 1 = Mon, etc.
        const logicalDateKey = logicalMidnight.toDateString();

        // Determine group
        let groupKey = '';
        if (logicalDayOfWeek >= 1 && logicalDayOfWeek <= 4) groupKey = 'mon-thu';
        else if (logicalDayOfWeek === 5) groupKey = 'fri';
        else if (logicalDayOfWeek === 6) groupKey = 'sat';
        else if (logicalDayOfWeek === 0) groupKey = 'sun';

        const g = groups[groupKey];

        // Start seconds offset from logical midnight
        const startOffsetSec = session.start_epoch - Math.floor(logicalMidnight.getTime() / 1000);
        g.startSum += startOffsetSec;
        g.startCount++;

        // End seconds offset from logical midnight (only for completed sessions)
        if (session.end !== '🟢 Activa') {
            const endOffsetSec = startOffsetSec + liveDuration;
            g.endSum += endOffsetSec;
            g.endCount++;
        }

        // Playtime by logical day
        if (!g.playByDay[logicalDateKey]) g.playByDay[logicalDateKey] = 0;
        g.playByDay[logicalDateKey] += liveDuration;
    });

    // Update Daily Cards DOM
    updateGroupDOM('mon-thu', groups['mon-thu']);
    updateGroupDOM('fri', groups['fri']);
    updateGroupDOM('sat', groups['sat']);
    updateGroupDOM('sun', groups['sun']);
}

function updateGroupDOM(idPrefix, group) {
    const startAvgEl = document.getElementById(`stat-${idPrefix}-start`);
    const endAvgEl = document.getElementById(`stat-${idPrefix}-end`);
    const durAvgEl = document.getElementById(`stat-${idPrefix}-duration`);

    if (group.startCount === 0) {
        startAvgEl.innerText = "Sin registros";
        endAvgEl.innerText = "Sin registros";
        durAvgEl.innerText = "0s";
        return;
    }

    // Start Average format
    const avgStartSec = group.startSum / group.startCount;
    startAvgEl.innerText = formatTimeFromSeconds(avgStartSec);

    // End Average format
    if (group.endCount > 0) {
        const avgEndSec = group.endSum / group.endCount;
        endAvgEl.innerText = formatTimeFromSeconds(avgEndSec);
    } else {
        endAvgEl.innerText = "Sin registros";
    }

    // Playtime Average format
    const uniqueDays = Object.keys(group.playByDay);
    if (uniqueDays.length > 0) {
        const totalSec = uniqueDays.reduce((sum, k) => sum + group.playByDay[k], 0);
        const avgSec = totalSec / uniqueDays.length;
        durAvgEl.innerText = formatDuration(Math.round(avgSec));
    } else {
        durAvgEl.innerText = "0s";
    }
}

function resetStatsDisplay() {
    document.getElementById('stat-weekly-hours-avg').innerText = "0 horas / semana";
    const totalHoursEl = document.getElementById('stat-total-hours');
    if (totalHoursEl) totalHoursEl.innerText = "0s";
    
    const prefixes = ['mon-thu', 'fri', 'sat', 'sun'];
    prefixes.forEach(prefix => {
        document.getElementById(`stat-${prefix}-start`).innerText = "Sin registros";
        document.getElementById(`stat-${prefix}-end`).innerText = "Sin registros";
        document.getElementById(`stat-${prefix}-duration`).innerText = "0s";
    });
}

// Initial Data Fetch
fetchData();
setInterval(fetchData, 5000);

// Live clock ticker
setInterval(updateActiveTimes, 1000);
