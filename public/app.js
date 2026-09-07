var lastFetchedData = [];
var statsTimeWindow = 'all'; // default 'all' (All time history)
var statsActivityType = 'all'; // default 'all' (UDP + TCP sessions)
var weeklyActivityType = 'game'; // default 'game' (En Juego Activo)
if (typeof window !== 'undefined') {
    window.weeklyActivityType = weeklyActivityType;
}

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

function formatSessionEndTime(session) {
    if (session.end === '🟢 Activa') return '🟢 Activa';
    const baseTime = session.end_time_fmt || session.end || '';
    let daysDiff = session.days_diff;
    if (daysDiff === undefined && session.start_epoch && session.end_epoch) {
        const d1 = new Date(session.start_epoch * 1000);
        const d2 = new Date(session.end_epoch * 1000);
        const date1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
        const date2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
        daysDiff = Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
    }
    if (daysDiff > 0) {
        const tooltipText = daysDiff === 1
            ? "Esta sesión terminó 1 día después de su inicio"
            : `Esta sesión terminó ${daysDiff} días después de su inicio`;
        return `${baseTime} <span class="badge-next-day" title="${tooltipText}">+${daysDiff}d</span>`;
    }
    return baseTime;
}
window.formatSessionEndTime = formatSessionEndTime;

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

function formatLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
window.formatLocalDate = formatLocalDate;

function mergeIntervals(intervals) {
    if (!intervals || intervals.length === 0) return [];
    const valid = intervals.filter(([s, e]) => e > s);
    if (valid.length === 0) return [];
    valid.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [[valid[0][0], valid[0][1]]];
    for (let i = 1; i < valid.length; i++) {
        const prev = merged[merged.length - 1];
        const curr = valid[i];
        if (curr[0] <= prev[1]) {
            prev[1] = Math.max(prev[1], curr[1]);
        } else {
            merged.push([curr[0], curr[1]]);
        }
    }
    return merged;
}
window.mergeIntervals = mergeIntervals;

function computeMergedDuration(intervals) {
    return mergeIntervals(intervals).reduce((acc, [s, e]) => acc + (e - s), 0);
}
window.computeMergedDuration = computeMergedDuration;

window.getLogicalDayString = function(epoch) {
    const dt = new Date(epoch * 1000);
    // 5 AM rollover: sessions before 5 AM logically belong to the previous calendar day
    if (dt.getHours() < 5) {
        dt.setDate(dt.getDate() - 1);
    }
    return formatLocalDate(dt);
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

    // Build the 7 logical days of the selected week
    const days = [];
    for (let i = 0; i < 7; i++) {
        const dStart = new Date(range.start);
        dStart.setDate(dStart.getDate() + i);

        const dSplit = new Date(dStart);
        dSplit.setHours(14, 0, 0, 0); // 2:00 PM shift cut

        const dEnd = new Date(dStart);
        dEnd.setDate(dEnd.getDate() + 1);
        dEnd.setHours(5, 0, 0, 0); // 5:00 AM next day (end of logical day)

        days.push({
            dateStr: formatLocalDate(dStart),
            display: dStart.toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase(),
            dateFmt: dStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            startEpoch: dStart.getTime() / 1000,
            splitEpoch: dSplit.getTime() / 1000,
            endEpoch: dEnd.getTime() / 1000,
            morning: {
                start: null, end: null, duration: 0, activeDuration: 0, devices: new Set(), intervals: [],
                udpStart: null, udpEnd: null, udpDevices: new Set(), udpIntervals: []
            },
            afternoon: {
                start: null, end: null, duration: 0, activeDuration: 0, devices: new Set(), intervals: [],
                udpStart: null, udpEnd: null, udpDevices: new Set(), udpIntervals: []
            },
            total: 0,
            activeTotal: 0
        });
    }

    let weeklyTotalSecs = 0;

    // Process sessions and partition accurately into morning and afternoon windows
    if (lastFetchedData && lastFetchedData.length > 0) {
        lastFetchedData.forEach(session => {
            const sStart = session.start_epoch;
            let sEnd = session.end_epoch;
            if (!sEnd) {
                if (session.end === '🟢 Activa') {
                    sEnd = Math.floor(Date.now() / 1000);
                } else {
                    sEnd = sStart + (session.duration_sec || 0);
                }
            }
            const isUDP = session.proto === 'UDP';

            days.forEach(day => {
                // 1. Morning shift: [day.startEpoch, day.splitEpoch] (5:00 AM to 2:00 PM)
                const mStart = Math.max(sStart, day.startEpoch);
                const mEnd = Math.min(sEnd, day.splitEpoch);
                if (mEnd > mStart) {
                    day.morning.intervals.push([mStart, mEnd]);
                    if (day.morning.start === null || mStart < day.morning.start) day.morning.start = mStart;
                    if (day.morning.end === null || mEnd > day.morning.end) day.morning.end = mEnd;
                    day.morning.devices.add(session.device);

                    if (isUDP) {
                        day.morning.udpIntervals.push([mStart, mEnd]);
                        if (day.morning.udpStart === null || mStart < day.morning.udpStart) day.morning.udpStart = mStart;
                        if (day.morning.udpEnd === null || mEnd > day.morning.udpEnd) day.morning.udpEnd = mEnd;
                        day.morning.udpDevices.add(session.device);
                    }
                }

                // 2. Afternoon shift: [day.splitEpoch, day.endEpoch] (2:00 PM to 5:00 AM next day)
                const aStart = Math.max(sStart, day.splitEpoch);
                const aEnd = Math.min(sEnd, day.endEpoch);
                if (aEnd > aStart) {
                    day.afternoon.intervals.push([aStart, aEnd]);
                    if (day.afternoon.start === null || aStart < day.afternoon.start) day.afternoon.start = aStart;
                    if (day.afternoon.end === null || aEnd > day.afternoon.end) day.afternoon.end = aEnd;
                    day.afternoon.devices.add(session.device);

                    if (isUDP) {
                        day.afternoon.udpIntervals.push([aStart, aEnd]);
                        if (day.afternoon.udpStart === null || aStart < day.afternoon.udpStart) day.afternoon.udpStart = aStart;
                        if (day.afternoon.udpEnd === null || aEnd > day.afternoon.udpEnd) day.afternoon.udpEnd = aEnd;
                        day.afternoon.udpDevices.add(session.device);
                    }
                }
            });
        });

        // Compute merged durations (union of time intervals) to prevent overlapping sessions from inflating elapsed time
        const isGameMode = weeklyActivityType === 'game';
        days.forEach(day => {
            day.morning.duration = computeMergedDuration(day.morning.intervals);
            day.morning.activeDuration = computeMergedDuration(day.morning.udpIntervals);
            day.afternoon.duration = computeMergedDuration(day.afternoon.intervals);
            day.afternoon.activeDuration = computeMergedDuration(day.afternoon.udpIntervals);
            day.total = day.morning.duration + day.afternoon.duration;
            day.activeTotal = day.morning.activeDuration + day.afternoon.activeDuration;
            weeklyTotalSecs += (isGameMode ? day.activeTotal : day.total);
        });
    }

    const todayStr = formatLocalDate(new Date());
    const isGameMode = weeklyActivityType === 'game';

    // Render cards
    days.forEach(day => {
        const card = document.createElement('div');
        card.className = 'stats-card weekly-day-card';

        const isFuture = day.dateStr > todayStr;

        const renderShift = (title, data) => {
            const shiftDur = isGameMode ? data.activeDuration : data.duration;
            if (shiftDur === 0) {
                const statusText = isFuture ? 'Pendiente' : 'Sin actividad';
                return `<div class="shift-block"><div class="shift-title">${title}</div><div class="shift-metrics">${statusText}</div></div>`;
            }

            const shiftStart = isGameMode ? data.udpStart : data.start;
            const shiftEnd = isGameMode ? data.udpEnd : data.end;
            const startStr = formatTimeFromSeconds(getSecondsSinceMidnight(new Date(shiftStart * 1000)));
            const endStr = formatTimeFromSeconds(getSecondsSinceMidnight(new Date(shiftEnd * 1000)));

            const devSet = isGameMode ? data.udpDevices : data.devices;
            let deviceIcons = '';
            if (devSet.has('PC')) deviceIcons += '<span title="Jugado en PC">💻</span>';
            if (devSet.has('Phone')) deviceIcons += '<span title="Jugado en Celular">📱</span>';

            let activeTooltip = '';
            if (data.duration > data.activeDuration) {
                if (isGameMode) {
                    activeTooltip = ` title="En juego activo: ${formatDuration(data.activeDuration)} (Total pantalla: ${formatDuration(data.duration)})"`;
                } else {
                    activeTooltip = ` title="Total pantalla: ${formatDuration(data.duration)} (En juego activo: ${formatDuration(data.activeDuration)})"`;
                }
            }

            return `
                <div class="shift-block">
                    <div class="shift-title">${title}</div>
                    <div class="shift-metrics">
                        <span>🕒 ${startStr} - ${endStr}</span>
                        <span${activeTooltip}>⏳ ${formatDuration(shiftDur)}</span>
                        <div class="shift-devices">${deviceIcons}</div>
                    </div>
                </div>
            `;
        };

        const dayTotal = isGameMode ? day.activeTotal : day.total;
        let dayFooterTooltip = '';
        if (day.total > day.activeTotal) {
            if (isGameMode) {
                dayFooterTooltip = ` title="En juego activo: ${formatDuration(day.activeTotal)} (Total pantalla: ${formatDuration(day.total)})"`;
            } else {
                dayFooterTooltip = ` title="Total pantalla: ${formatDuration(day.total)} (En juego activo: ${formatDuration(day.activeTotal)})"`;
            }
        }

        card.innerHTML = `
            <div class="weekly-day-header">
                <span class="weekly-day-name">${day.display}</span>
                <span class="weekly-day-date">${day.dateFmt}</span>
            </div>
            ${renderShift('🌅 MAÑANA', day.morning)}
            ${renderShift('🌇 TARDE / NOCHE', day.afternoon)}
            <div class="day-total-footer"${dayFooterTooltip}>
                Total: ${formatDuration(dayTotal)}
            </div>
        `;
        grid.appendChild(card);
    });

    const weeklyTitleEl = document.getElementById('stat-weekly-title');
    if (weeklyTitleEl) {
        const titleStr = isGameMode 
            ? 'Total Horas Jugadas en la Semana (En Juego Activo)'
            : 'Total Horas Jugadas en la Semana (Total En Juego)';
        weeklyTitleEl.textContent = titleStr;
        weeklyTitleEl.innerText = titleStr;
    }

    const weeklyTotalEl = document.getElementById('stat-weekly-total-hours');
    if (weeklyTotalEl) {
        const durStr = formatDuration(weeklyTotalSecs);
        weeklyTotalEl.textContent = durStr;
        weeklyTotalEl.innerText = durStr;
    }

    const rangeLabel = document.getElementById('weekly-range-label') ? document.getElementById('weekly-range-label').innerText : "esta semana";
    updateGeminiDeeplink('tab-weekly', rangeLabel, weeklyTotalSecs);
}


// Filter setters
window.setWeeklyActivityType = function(type) {
    weeklyActivityType = type;
    if (typeof window !== 'undefined') {
        window.weeklyActivityType = type;
    }
    document.querySelectorAll('#weekly-type-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
    
    if (type === 'game') {
        const btn = document.getElementById('weekly-type-btn-game');
        if (btn) btn.classList.add('active');
    } else if (type === 'all') {
        const btn = document.getElementById('weekly-type-btn-all');
        if (btn) btn.classList.add('active');
    }
    
    updateWeeklySummary();
};

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

            const endHtml = formatSessionEndTime(session);

            row.innerHTML = `
                <td>${deviceHtml}</td>
                <td>${typeHtml}</td>
                <td>${session.start_time_fmt}</td>
                <td>${endHtml}</td>
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
    const activeIntervalsByDay = {};
    const aggregateIntervalsByDay = {};
    
    if (lastFetchedData && lastFetchedData.length > 0) {
        lastFetchedData.forEach(session => {
            const day = session.date;
            if (!activeIntervalsByDay[day]) activeIntervalsByDay[day] = [];
            if (!aggregateIntervalsByDay[day]) aggregateIntervalsByDay[day] = [];
            
            const sStart = session.start_epoch;
            let sEnd = session.end_epoch;
            if (!sEnd) {
                if (session.end === '🟢 Activa') {
                    sEnd = Math.floor(Date.now() / 1000);
                } else {
                    sEnd = sStart + (session.duration_sec || 0);
                }
            }
            if (sEnd > sStart) {
                aggregateIntervalsByDay[day].push([sStart, sEnd]);
                if (session.proto === 'UDP') {
                    activeIntervalsByDay[day].push([sStart, sEnd]);
                }
            }
        });
    }

    document.querySelectorAll('.day-total').forEach(span => {
        const day = span.getAttribute('data-day');
        const type = span.getAttribute('data-type');
        if (type === 'active') {
            const sec = computeMergedDuration(activeIntervalsByDay[day] || []);
            span.innerText = `🎮 En Juego Activo: ${formatDuration(sec)}`;
        } else {
            const sec = computeMergedDuration(aggregateIntervalsByDay[day] || []);
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
