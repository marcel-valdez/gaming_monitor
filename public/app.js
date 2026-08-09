let lastFetchedData = [];

async function fetchData() {
    try {
        const response = await fetch('data.json?t=' + Date.now());
        const data = await response.json();
        lastFetchedData = data;
        render(data);
        actualizarEstadisticas();
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
        title.innerHTML = `${day} <span class="day-total" data-day="${day}">(Total Jugado: -)</span>`;
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
            if (session.proto === 'UDP') typeHtml = '<span class="type-gameplay">🎮 Jugando (Activo)</span>';
            else typeHtml = '<span class="type-menu">⚙️ Menús / Chat</span>';

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

    actualizarTiemposActivos();
}

function actualizarTiemposActivos() {
    const celdasActivas = document.querySelectorAll('.active-duration');
    const ahora = Math.floor(Date.now() / 1000);
    
    celdasActivas.forEach(celda => {
        const inicioStr = celda.getAttribute('data-start');
        if (!inicioStr) return;
        
        const inicioEpoch = parseInt(inicioStr, 10);
        let duracion = ahora - inicioEpoch;
        if (duracion < 0) duracion = 0;
        
        celda.innerText = formatDuration(duracion);
    });

    // Automatically recalculate day totals and statistics on every second to allow live-ticking active sessions
    actualizarDayTotals();
    actualizarEstadisticas();
}

function actualizarDayTotals() {
    const dayTotals = {};
    lastFetchedData.forEach(session => {
        if (session.proto !== 'UDP') return;
        const day = session.date;
        if (!dayTotals[day]) dayTotals[day] = 0;
        dayTotals[day] += getSessionLiveDuration(session);
    });

    document.querySelectorAll('.day-total').forEach(span => {
        const day = span.getAttribute('data-day');
        const totalSec = dayTotals[day] || 0;
        span.innerText = `Total Jugado: ${formatDuration(totalSec)}`;
    });
}

function actualizarEstadisticas() {
    if (!lastFetchedData || lastFetchedData.length === 0) {
        document.getElementById('stat-weekly-total').innerText = '0s';
        document.getElementById('stat-monthly-total').innerText = '0s';
        document.getElementById('stat-weekday-avg').innerText = '0s';
        document.getElementById('stat-weekend-avg').innerText = '0s';
        document.getElementById('stat-weekday-start-avg').innerText = 'Sin registros';
        document.getElementById('stat-weekend-start-avg').innerText = 'Sin registros';
        document.getElementById('stat-weekday-end-avg').innerText = 'Sin registros';
        return;
    }

    const startOfWeek = getStartOfCurrentWeek();
    const startOfMonth = getStartOfCurrentMonth();

    let weeklyTotalSec = 0;
    let monthlyTotalSec = 0;

    const weekdayTotalsByDay = {};
    const weekendTotalsByDay = {};

    let weekdayStartTimesSum = 0;
    let weekdayStartTimesCount = 0;

    let weekendStartTimesSum = 0;
    let weekendStartTimesCount = 0;

    let weekdayEndTimesSum = 0;
    let weekdayEndTimesCount = 0;

    lastFetchedData.forEach(session => {
        if (session.proto !== 'UDP') return;

        const sessionDate = new Date(session.start_epoch * 1000);
        const dayOfWeek = sessionDate.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const dayKey = session.date;

        const liveDuration = getSessionLiveDuration(session);

        // Weekly total
        if (sessionDate >= startOfWeek) {
            weeklyTotalSec += liveDuration;
        }

        // Monthly total
        if (sessionDate >= startOfMonth) {
            monthlyTotalSec += liveDuration;
        }

        // Group daily totals for average calculation
        if (isWeekend) {
            if (!weekendTotalsByDay[dayKey]) weekendTotalsByDay[dayKey] = 0;
            weekendTotalsByDay[dayKey] += liveDuration;
        } else {
            if (!weekdayTotalsByDay[dayKey]) weekdayTotalsByDay[dayKey] = 0;
            weekdayTotalsByDay[dayKey] += liveDuration;
        }

        // Session start times
        const startSec = getSecondsSinceMidnight(sessionDate);
        if (isWeekend) {
            weekendStartTimesSum += startSec;
            weekendStartTimesCount++;
        } else {
            weekdayStartTimesSum += startSec;
            weekdayStartTimesCount++;

            // Session end times (only for completed sessions)
            if (session.end !== '🟢 Activa') {
                const endDate = new Date((session.start_epoch + session.duration_sec) * 1000);
                const endSec = getSecondsSinceMidnight(endDate);
                weekdayEndTimesSum += endSec;
                weekdayEndTimesCount++;
            }
        }
    });

    // Compute averages
    const weekdayDays = Object.keys(weekdayTotalsByDay);
    const weekdayAverageSec = weekdayDays.length > 0
        ? weekdayDays.reduce((sum, day) => sum + weekdayTotalsByDay[day], 0) / weekdayDays.length
        : 0;

    const weekendDays = Object.keys(weekendTotalsByDay);
    const weekendAverageSec = weekendDays.length > 0
        ? weekendDays.reduce((sum, day) => sum + weekendTotalsByDay[day], 0) / weekendDays.length
        : 0;

    const avgWeekdayStartStr = weekdayStartTimesCount > 0
        ? formatTimeFromSeconds(weekdayStartTimesSum / weekdayStartTimesCount)
        : "Sin registros";

    const avgWeekendStartStr = weekendStartTimesCount > 0
        ? formatTimeFromSeconds(weekendStartTimesSum / weekendStartTimesCount)
        : "Sin registros";

    const avgWeekdayEndStr = weekdayEndTimesCount > 0
        ? formatTimeFromSeconds(weekdayEndTimesSum / weekdayEndTimesCount)
        : "Sin registros";

    // Update DOM elements
    document.getElementById('stat-weekly-total').innerText = formatDuration(weeklyTotalSec);
    document.getElementById('stat-monthly-total').innerText = formatDuration(monthlyTotalSec);
    document.getElementById('stat-weekday-avg').innerText = formatDuration(Math.round(weekdayAverageSec));
    document.getElementById('stat-weekend-avg').innerText = formatDuration(Math.round(weekendAverageSec));
    document.getElementById('stat-weekday-start-avg').innerText = avgWeekdayStartStr;
    document.getElementById('stat-weekend-start-avg').innerText = avgWeekendStartStr;
    document.getElementById('stat-weekday-end-avg').innerText = avgWeekdayEndStr;
}

// Initial Data Fetch
fetchData();
setInterval(fetchData, 5000);

// Live clock ticker
setInterval(actualizarTiemposActivos, 1000);
