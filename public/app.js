async function fetchData() {
    try {
        const response = await fetch('data.json?t=' + Date.now());
        const data = await response.json();
        render(data);
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

function render(data) {
    const dashboard = document.getElementById('dashboard');
    dashboard.innerHTML = '';

    if (!data || data.length === 0) {
        dashboard.innerHTML = '<div class="day-card"><p style="text-align:center;">No hay sesiones registradas aún.</p></div>';
        return;
    }

    // Agrupar por día
    const sessionsByDay = {};
    data.forEach(session => {
        if (!sessionsByDay[session.date]) {
            sessionsByDay[session.date] = [];
        }
        sessionsByDay[session.date].push(session);
    });

    // Ordenar días descendente
    const sortedDays = Object.keys(sessionsByDay).sort((a, b) => b.localeCompare(a));

    sortedDays.forEach(day => {
        const card = document.createElement('div');
        card.className = 'day-card';

        // Formatear fecha (opcional: podrías usar Intl.DateTimeFormat)
        const title = document.createElement('h2');
        title.className = 'day-title';
        title.innerText = day; // El shell script ya provee una fecha formateada o cruda
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
}

// Polling de datos cada 5 segundos
fetchData();
setInterval(fetchData, 5000);

// Reloj fluido cada segundo
setInterval(actualizarTiemposActivos, 1000);
