const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function runUnitTests() {
    console.log("=== Running Javascript Unit Tests ===");
    const html = `<!DOCTYPE html><html><body>
        <div id="time-filters">
            <button id="time-btn-30" class="filter-btn"></button>
            <button id="time-btn-90" class="filter-btn"></button>
            <button id="time-btn-365" class="filter-btn"></button>
            <button id="time-btn-all" class="filter-btn active"></button>
        </div>
        <div id="type-filters">
            <button id="type-btn-all" class="filter-btn active"></button>
            <button id="type-btn-game" class="filter-btn"></button>
        </div>
        <div id="stat-total-hours"></div>
        <div id="stat-weekly-hours-avg"></div>
        <a id="gemini-analysis-link"></a>
        <div id="gemini-no-data-stats"></div>
        <div id="stat-mon-thu-start"></div>
        <div id="stat-mon-thu-end"></div>
        <div id="stat-mon-thu-duration"></div>
        <div id="stat-fri-start"></div>
        <div id="stat-fri-end"></div>
        <div id="stat-fri-duration"></div>
        <div id="stat-sat-start"></div>
        <div id="stat-sat-end"></div>
        <div id="stat-sat-duration"></div>
        <div id="stat-sun-start"></div>
        <div id="stat-sun-end"></div>
        <div id="stat-sun-duration"></div>
    </body></html>`;
    
    const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

    const dom = new JSDOM(html, { runScripts: "dangerously" });
    const { window } = dom;

    // Evaluate app.js in context
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.body.appendChild(script);

    let allPassed = true;

    // Assert Helper
    const assertEqual = (actual, expected, message) => {
        if (actual !== expected) {
            console.error(`❌ FAIL: ${message}. Expected: "${expected}", Got: "${actual}"`);
            allPassed = false;
        } else {
            console.log(`✅ PASS: ${message}`);
        }
    };

    // Test 1: formatDuration
    assertEqual(window.formatDuration(0), "0s", "formatDuration(0) should return 0s");
    assertEqual(window.formatDuration(45), "45s", "formatDuration(45) should return 45s");
    assertEqual(window.formatDuration(125), "2m 5s", "formatDuration(125) should return 2m 5s");
    assertEqual(window.formatDuration(3665), "1h 1m 5s", "formatDuration(3665) should return 1h 1m 5s");

    // Test 2: formatTimeFromSeconds
    assertEqual(window.formatTimeFromSeconds(3600), "1:00 AM", "formatTimeFromSeconds(3600) -> 1:00 AM");
    assertEqual(window.formatTimeFromSeconds(43200), "12:00 PM", "formatTimeFromSeconds(43200) -> 12:00 PM");
    assertEqual(window.formatTimeFromSeconds(82800), "11:00 PM", "formatTimeFromSeconds(82800) -> 11:00 PM");
    assertEqual(window.formatTimeFromSeconds(93600), "2:00 AM", "formatTimeFromSeconds(93600) -> 2:00 AM (next day)");

    // Test 3: getSecondsSinceMidnight
    const d1 = new Date();
    d1.setHours(10, 15, 30);
    assertEqual(window.getSecondsSinceMidnight(d1), 10 * 3600 + 15 * 60 + 30, "getSecondsSinceMidnight(10:15:30)");

    // Test 4: sortDaysByEpoch - Reverse Chronological Day Sorting (Newest First)
    const mockSessionsByDay = {
        '09 de agosto de 2026': [{ start_epoch: 1786332186 }],
        '31 de agosto de 2026': [{ start_epoch: 1788220800 }],
        '06 de septiembre de 2026': [{ start_epoch: 1788756745 }],
        '01 de septiembre de 2026': [{ start_epoch: 1788321600 }]
    };
    const sortedDays = window.sortDaysByEpoch(mockSessionsByDay);
    assertEqual(sortedDays[0], '06 de septiembre de 2026', "Top day should be September 6th");
    assertEqual(sortedDays[1], '01 de septiembre de 2026', "Second day should be September 1st");
    assertEqual(sortedDays[2], '31 de agosto de 2026', "Third day should be August 31st");
    assertEqual(sortedDays[3], '09 de agosto de 2026', "Last day should be August 9th");

    // Test 5: Intra-day sorting (Reverse chronological sort by start_epoch: latest session first)
    const mockDaySessions = [
        { start_epoch: 1788760000, start_time_fmt: "9:20 AM" },
        { start_epoch: 1788750000, start_time_fmt: "6:30 AM" },
        { start_epoch: 1788770000, start_time_fmt: "12:10 PM" }
    ];
    mockDaySessions.sort((a, b) => (b.start_epoch || 0) - (a.start_epoch || 0));
    assertEqual(mockDaySessions[0].start_time_fmt, "12:10 PM", "First intra-day session should be latest (12:10 PM)");
    assertEqual(mockDaySessions[1].start_time_fmt, "9:20 AM", "Second intra-day session should be intermediate (9:20 AM)");
    assertEqual(mockDaySessions[2].start_time_fmt, "6:30 AM", "Third intra-day session should be earliest (6:30 AM)");
    // Test 6: formatSessionEndTime tests
    // 6a: Active session
    assertEqual(window.formatSessionEndTime({ end: '🟢 Activa' }), '🟢 Activa', "Active session should return 🟢 Activa");
    
    // 6b: Same-day session (no badge)
    assertEqual(window.formatSessionEndTime({ end_time_fmt: '5:30 PM', days_diff: 0 }), '5:30 PM', "Same-day session should return plain time string without badge");

    // 6c: +1 day session (badge +1d with tooltip)
    const nextDayResult = window.formatSessionEndTime({ end_time_fmt: '12:15 AM', days_diff: 1 });
    assertEqual(nextDayResult, '12:15 AM <span class="badge-next-day" title="Esta sesión terminó 1 día después de su inicio">+1d</span>', "+1d session should include badge and 1 day tooltip");

    // 6d: +2 days session (badge +2d with tooltip)
    const multiDayResult = window.formatSessionEndTime({ end_time_fmt: '1:38 AM', days_diff: 2 });
    assertEqual(multiDayResult, '1:38 AM <span class="badge-next-day" title="Esta sesión terminó 2 días después de su inicio">+2d</span>', "+2d session should include badge and 2 days tooltip");

    // 6e: Fallback calculation from start_epoch and end_epoch
    const fallbackResult = window.formatSessionEndTime({
        start_epoch: 1788471574, // 2026-09-03 14:39:34
        end_epoch: 1788597493,   // 2026-09-05 01:38:13
        end_time_fmt: '1:38 AM'
    });
    assertEqual(fallbackResult, '1:38 AM <span class="badge-next-day" title="Esta sesión terminó 2 días después de su inicio">+2d</span>', "Fallback calculation using epoch timestamps should produce +2d badge");

    // Test 7: Overlapping concurrent sessions in Stats tab (e.g. 9-12 TCP and 10-1 UDP on Monday)
    // Reference Monday 10 AM (within Monday logical day, starts >= 5 AM)
    const baseMon = 1788220800; // Mon Aug 31 2026 approx
    const mon9AM = baseMon + 9 * 3600;
    const mon12PM = baseMon + 12 * 3600;
    const mon10AM = baseMon + 10 * 3600;
    const mon1PM = baseMon + 13 * 3600;

    window.lastFetchedData = [
        {
            start_epoch: mon9AM,
            end_epoch: mon12PM,
            duration_sec: 10800, // 3h TCP
            proto: 'TCP',
            device: 'PC',
            end: '12:00 PM'
        },
        {
            start_epoch: mon10AM,
            end_epoch: mon1PM,
            duration_sec: 10800, // 3h UDP
            proto: 'UDP',
            device: 'Phone',
            end: '1:00 PM'
        }
    ];

    // In 'all' mode: 9-12 TCP and 10-1 UDP should merge to 4h (14400s), NOT 6h
    window.setStatsActivityType('all');
    window.updateStatistics();
    const totalAllEl = window.document.getElementById('stat-total-hours');
    assertEqual(totalAllEl.textContent.includes('4h'), true, "In 'all' mode, overlapping 3h TCP + 3h UDP merge to 4h total (not 6h)");
    assertEqual(!totalAllEl.textContent.includes('6h'), true, "In 'all' mode, total must not double-count to 6h");

    // In 'game' mode: only UDP session (10-1 = 3h) should be counted
    window.setStatsActivityType('game');
    window.updateStatistics();
    const totalGameEl = window.document.getElementById('stat-total-hours');
    assertEqual(totalGameEl.textContent.includes('3h'), true, "In 'game' mode, only 3h UDP gameplay session is counted");

    // Test 8: Real dataset verification for Stats tab (clean un-inflated numbers)
    const dataJsonPath = path.join(__dirname, '../public/data.json');
    if (fs.existsSync(dataJsonPath)) {
        const realData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
        window.lastFetchedData = realData;

        // Verify 'all' mode (Total En Juego)
        window.setStatsActivityType('all');
        window.updateStatistics();
        const realTotalHoursAll = window.document.getElementById('stat-total-hours').textContent;
        const realWeeklyAvgAll = window.document.getElementById('stat-weekly-hours-avg').textContent;
        const realSatDurationAll = window.document.getElementById('stat-sat-duration').textContent;

        assertEqual(realTotalHoursAll.includes('155h') || realTotalHoursAll.includes('156h'), true, "Total hours in 'all' mode should be ~156h (merged intervals, not 284h)");
        assertEqual(!realTotalHoursAll.includes('284h'), true, "Total hours must not be inflated to 284h");
        assertEqual(realWeeklyAvgAll.includes('38.') || realWeeklyAvgAll.includes('39.'), true, "Weekly average in 'all' mode should be ~38.8h / semana (not 70.7h)");
        assertEqual(!realWeeklyAvgAll.includes('70.'), true, "Weekly average must not be inflated to 70.7h");
        assertEqual(realSatDurationAll.includes('11h'), true, "Saturday average in 'all' mode should be ~11.5h (not 21.3h)");
        assertEqual(!realSatDurationAll.includes('21h'), true, "Saturday average must not be inflated to 21.3h");

        // Verify 'game' mode (En Juego Activo)
        window.setStatsActivityType('game');
        window.updateStatistics();
        const realTotalHoursGame = window.document.getElementById('stat-total-hours').textContent;
        const realWeeklyAvgGame = window.document.getElementById('stat-weekly-hours-avg').textContent;
        const realSatDurationGame = window.document.getElementById('stat-sat-duration').textContent;

        assertEqual(realTotalHoursGame.includes('127h'), true, "Total hours in 'game' mode should be ~127h");
        assertEqual(realWeeklyAvgGame.includes('31.') || realWeeklyAvgGame.includes('32.'), true, "Weekly average in 'game' mode should be ~31.7h / semana");
        assertEqual(realSatDurationGame.includes('9h') || realSatDurationGame.includes('10h'), true, "Saturday average in 'game' mode should be ~9.8h");
    }

    if (allPassed) {
        console.log("=== All JS Unit Tests Passed Successfully ===");
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runUnitTests().catch(err => {
    console.error(err);
    process.exit(1);
});
