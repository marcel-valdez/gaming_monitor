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

// Tab switcher globally accessible for JSDOM and inline html onclick
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabId === 'history') {
        document.getElementById('tab-btn-history').classList.add('active');
        document.getElementById('tab-history').classList.add('active');
    } else if (tabId === 'stats') {
        document.getElementById('tab-btn-stats').classList.add('active');
        document.getElementById('tab-stats').classList.add('active');
    }
};

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

    // Sort days descending
    const sortedDays = Object.keys(sessionsByDay).sort((a, b) => b.localeCompare(a));

    sortedDays.forEach(day => {
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

    const filtered = lastFetchedData.filter(session => {
        if (statsTimeWindow !== 'all' && (session.start_epoch * 1000 < cutoffTime)) {
            return false;
        }
        if (statsActivityType === 'game' && session.proto !== 'UDP') {
            return false;
        }
        return true;
    });

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
