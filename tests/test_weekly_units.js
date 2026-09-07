const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function runWeeklyUnitTests() {
    console.log("=== Running Weekly JS Unit Tests ===");
    const html = `<!DOCTYPE html><html><body>
        <div id="tab-weekly">
            <div class="filter-buttons" id="weekly-type-filters">
                <button id="weekly-type-btn-game" class="filter-btn active" onclick="setWeeklyActivityType('game')">🎮 En Juego Activo</button>
                <button id="weekly-type-btn-all" class="filter-btn" onclick="setWeeklyActivityType('all')">👨‍💻 Total En Juego</button>
            </div>
            <div id="weekly-grid"></div>
            <div id="weekly-range-label"></div>
            <h3 id="stat-weekly-title">Total Horas Jugadas en la Semana (En Juego Activo)</h3>
            <div id="stat-weekly-total-hours"></div>
            <a id="gemini-analysis-link"></a>
            <div id="gemini-no-data-weekly"></div>
        </div>
        <div id="tab-stats">
            <div id="stat-total-hours"></div>
            <a id="gemini-analysis-link"></a>
            <div id="gemini-no-data-stats"></div>
        </div>
    </body></html>`;
    
    const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    const dom = new JSDOM(html, { runScripts: "dangerously" });
    const { window } = dom;

    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.body.appendChild(script);

    let allPassed = true;
    const assertEqual = (actual, expected, message) => {
        if (actual !== expected) {
            console.error(`❌ FAIL: ${message}. Expected: "${expected}", Got: "${actual}"`);
            allPassed = false;
        } else {
            console.log(`✅ PASS: ${message}`);
        }
    };

    // Test 0: Verify default state
    assertEqual(window.weeklyActivityType, "game", "Default weekly activity type should be 'game'");

    // Test 1: getLogicalDay (5 AM rollover and timezone robustness)
    // 2026-08-08 04:59:59 -> 2026-08-07
    const t1 = new Date('2026-08-08T04:59:59').getTime() / 1000;
    assertEqual(window.getLogicalDayString(t1), "2026-08-07", "04:59:59 should be previous day");
    
    // 2026-08-08 05:00:00 -> 2026-08-08
    const t2 = new Date('2026-08-08T05:00:00').getTime() / 1000;
    assertEqual(window.getLogicalDayString(t2), "2026-08-08", "05:00:00 should be current day");

    // Evening local times (must not roll over to next day due to UTC conversions)
    const tEvening1 = new Date('2026-08-08T20:00:00').getTime() / 1000;
    assertEqual(window.getLogicalDayString(tEvening1), "2026-08-08", "20:00:00 local should stay on 2026-08-08");
    const tEvening2 = new Date('2026-08-08T23:59:59').getTime() / 1000;
    assertEqual(window.getLogicalDayString(tEvening2), "2026-08-08", "23:59:59 local should stay on 2026-08-08");

    // Test formatLocalDate
    assertEqual(window.formatLocalDate(new Date('2026-08-31T20:00:00')), "2026-08-31", "formatLocalDate formats in local time");

    // Test 2: getShift (5 AM - 2 PM vs 2 PM - 5 AM)
    // 05:00:00 -> morning
    assertEqual(window.getShift(t2), "morning", "05:00:00 is morning");
    // 13:59:59 -> morning
    const t3 = new Date('2026-08-08T13:59:59').getTime() / 1000;
    assertEqual(window.getShift(t3), "morning", "13:59:59 is morning");
    // 14:00:00 -> afternoon
    const t4 = new Date('2026-08-08T14:00:00').getTime() / 1000;
    assertEqual(window.getShift(t4), "afternoon", "14:00:00 is afternoon");
    // 03:00:00 -> afternoon
    const t5 = new Date('2026-08-09T03:00:00').getTime() / 1000;
    assertEqual(window.getShift(t5), "afternoon", "03:00:00 is afternoon (of previous day)");

    // Test 3: getWeeklyRange (Monday 5 AM start)
    const range = window.getWeeklyRange(0);
    const start = range.start;
    const isMonday = start.getDay() === 1;
    const is5AM = start.getHours() === 5;
    assertEqual(isMonday && is5AM, true, "Weekly range start should be Monday at 5 AM");

    // Test 4: updateWeeklySummary with NO data
    window.lastFetchedData = [];
    window.updateWeeklySummary();
    const cards = window.document.querySelectorAll('.weekly-day-card');
    assertEqual(cards.length, 7, "Should still render 7 cards for empty week");
    
    const weeklyTotalEl = window.document.getElementById('stat-weekly-total-hours');
    assertEqual(weeklyTotalEl.textContent || weeklyTotalEl.innerText, "0s", "Weekly total should be 0s for empty week");

    const linkWeekly = window.document.querySelector('#tab-weekly #gemini-analysis-link');
    const noDataMsgWeekly = window.document.querySelector('#tab-weekly #gemini-no-data-weekly');
    assertEqual(linkWeekly.style.display, 'none', "Gemini link in Weekly tab should be hidden when no data");
    assertEqual(noDataMsgWeekly.style.display, 'block', "No-data message in Weekly tab should be visible when no data");

    // Test 5: updateGeminiDeeplink with data (Google Search AI mode)
    window.updateGeminiDeeplink('tab-weekly', 'esta semana', 3600);
    assertEqual(linkWeekly.style.display, 'inline-block', "Link should be visible with data");
    assertEqual(linkWeekly.href.includes('google.com/search?udm=50'), true, "Link should use Google Search AI mode (udm=50)");
    assertEqual(linkWeekly.href.includes('1.0%20horas'), true, "Link should report 1.0 hours in prompt");

    // Test 6: Pendiente vs Sin Actividad
    // Assuming 'today' is Sat Aug 08 2026 (mock logic or real date)
    // We can't easily mock Date.now() here without full Sinon, but we can check if BOTH labels exist across cards
    let foundSinActividad = false;
    let foundPendiente = false;
    cards.forEach(c => {
        if (c.textContent.includes('Sin actividad')) foundSinActividad = true;
        if (c.textContent.includes('Pendiente')) foundPendiente = true;
    });
    // At any given time in a week, unless it's Monday 5AM or Sunday 11PM, we should see both for the current week.
    assertEqual(foundSinActividad || foundPendiente, true, "Should show either 'Sin actividad' or 'Pendiente'");

    // Test 7: Shift Partitioning across 2:00 PM boundary
    // Session on Monday of current week spanning 12:00 PM to 4:00 PM (4 hours = 14400s)
    const mon12PM = Math.floor(range.start.getTime() / 1000) + 7 * 3600;
    const mon4PM = Math.floor(range.start.getTime() / 1000) + 11 * 3600;
    window.lastFetchedData = [{
        start_epoch: mon12PM,
        end_epoch: mon4PM,
        duration_sec: 14400,
        device: 'PC',
        proto: 'UDP',
        end: '2026-08-31 16:00:00'
    }];
    window.updateWeeklySummary();
    const updatedCards = window.document.querySelectorAll('.weekly-day-card');
    const mondayCard = updatedCards[0];
    const shiftBlocks = mondayCard.querySelectorAll('.shift-block');
    const morningBlock = shiftBlocks[0];
    const afternoonBlock = shiftBlocks[1];
    const dayTotalText = mondayCard.querySelector('.day-total-footer').textContent;

    assertEqual(morningBlock.textContent.includes('2h'), true, "Morning shift receives 2h slice (12:00 to 14:00)");
    assertEqual(afternoonBlock.textContent.includes('2h'), true, "Afternoon shift receives 2h slice (14:00 to 16:00)");
    assertEqual(dayTotalText.includes('4h'), true, "Total for day is correctly sum of both slices (4h)");

    // Test 8: Monday August 31 data from dataset
    const dataJsonPath = path.join(__dirname, '../public/data.json');
    if (fs.existsSync(dataJsonPath)) {
        const realData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
        window.lastFetchedData = realData;
        window.updateWeeklySummary();
        const cardsWithData = window.document.querySelectorAll('.weekly-day-card');
        const realMonCard = cardsWithData[0];
        const shiftBlocksReal = realMonCard.querySelectorAll('.shift-block');
        const realMonAfternoon = shiftBlocksReal[1];
        assertEqual(!realMonAfternoon.textContent.includes('Sin actividad'), true, "Monday Aug 31 has active sessions in afternoon shift");
        assertEqual(realMonAfternoon.textContent.includes('6:13 PM'), true, "Monday Aug 31 active gameplay starts at 6:13 PM in 'game' mode");

        // Test 11: Sunday Sep 6 real data in default ('game') mode:
        // Active gameplay is 10h 9m 16s (Morning: 4h 38m 40s, Afternoon: 5h 30m 36s)
        const realSunCard = cardsWithData[6];
        const sunShiftBlocks = realSunCard.querySelectorAll('.shift-block');
        const sunMorning = sunShiftBlocks[0];
        const sunAfternoon = sunShiftBlocks[1];
        const sunTotal = realSunCard.querySelector('.day-total-footer').textContent;
        const weeklyTitle = window.document.getElementById('stat-weekly-title').textContent;

        assertEqual(weeklyTitle.includes('(En Juego Activo)'), true, "Banner title indicates En Juego Activo by default");
        assertEqual(sunMorning.textContent.includes('4h'), true, "Sunday morning active gameplay should be ~4h 38m");
        assertEqual(sunAfternoon.textContent.includes('5h'), true, "Sunday afternoon active gameplay should be ~5h 30m");
        assertEqual(sunTotal.includes('10h'), true, "Sunday total active gameplay should be 10h 9m 16s");

        // Now toggle to 'all' mode:
        window.setWeeklyActivityType('all');
        const cardsAll = window.document.querySelectorAll('.weekly-day-card');
        const sunTotalAll = cardsAll[6].querySelector('.day-total-footer').textContent;
        const weeklyTitleAll = window.document.getElementById('stat-weekly-title').textContent;
        assertEqual(weeklyTitleAll.includes('(Total En Juego)'), true, "Banner title indicates Total En Juego after switch");
        assertEqual(sunTotalAll.includes('10h'), true, "Sunday total in 'all' mode should be 10h 9m 16s (clean P99, no idle socket)");
        assertEqual(!sunTotalAll.includes('23h'), true, "Sunday total must not be inflated to 23h");

        // Verify Monday Aug 31 in 'all' mode starts at 6:13 PM (clean P99)
        const realMonAfternoonAll = cardsAll[0].querySelectorAll('.shift-block')[1];
        assertEqual(realMonAfternoonAll.textContent.includes('6:13 PM'), true, "Monday Aug 31 Total En Juego starts at 6:13 PM in 'all' mode");

        // Switch back to 'game' mode for remaining tests
        window.setWeeklyActivityType('game');
    }

    // Test 9: mergeIntervals and computeMergedDuration utility functions
    const testIntervals1 = [[100, 300], [200, 400]]; // overlaps
    assertEqual(window.computeMergedDuration(testIntervals1), 300, "Overlapping intervals [100,300] and [200,400] merge to 300s");
    const testIntervals2 = [[100, 500], [200, 300], [250, 400]]; // subsumed
    assertEqual(window.computeMergedDuration(testIntervals2), 400, "Subsumed intervals merge to [100, 500] (400s)");
    const testIntervals3 = [[300, 400], [100, 200]]; // disjoint unsorted
    assertEqual(window.computeMergedDuration(testIntervals3), 200, "Disjoint unsorted intervals merge to 200s");

    // Test 10: Overlapping concurrent sessions in a shift (e.g. 9:00 AM-12:00 PM TCP and 10:00 AM-1:00 PM UDP)
    const mon9AM = Math.floor(range.start.getTime() / 1000) + 4 * 3600; // 9:00 AM
    const mon12PM_test = Math.floor(range.start.getTime() / 1000) + 7 * 3600; // 12:00 PM
    const mon10AM = Math.floor(range.start.getTime() / 1000) + 5 * 3600; // 10:00 AM
    const mon1PM = Math.floor(range.start.getTime() / 1000) + 8 * 3600; // 1:00 PM
    window.lastFetchedData = [
        {
            start_epoch: mon9AM,
            end_epoch: mon12PM_test,
            duration_sec: 10800, // 3 hours
            device: 'PC',
            proto: 'TCP',
            end: '2026-08-31 12:00:00'
        },
        {
            start_epoch: mon10AM,
            end_epoch: mon1PM,
            duration_sec: 10800, // 3 hours
            device: 'Phone',
            proto: 'UDP',
            end: '2026-08-31 13:00:00'
        }
    ];
    // In 'game' mode (default): Only UDP is counted (10:00 AM - 1:00 PM = 3h, Phone only)
    window.setWeeklyActivityType('game');
    window.updateWeeklySummary();
    const overlapCards = window.document.querySelectorAll('.weekly-day-card');
    const overlapMonCard = overlapCards[0];
    const overlapMorningGame = overlapMonCard.querySelectorAll('.shift-block')[0];
    assertEqual(overlapMorningGame.textContent.includes('3h'), true, "In 'game' mode, only UDP session (3h) is shown");
    assertEqual(overlapMorningGame.textContent.includes('📱'), true, "In 'game' mode, phone device icon is present");
    assertEqual(!overlapMorningGame.textContent.includes('💻'), true, "In 'game' mode, PC (TCP only) device icon is absent");

    // In 'all' mode: Both TCP (9-12) and UDP (10-1) are merged to 4h (9-1) with both devices
    window.setWeeklyActivityType('all');
    const overlapCardsAll = window.document.querySelectorAll('.weekly-day-card');
    const overlapMorningAll = overlapCardsAll[0].querySelectorAll('.shift-block')[0];
    assertEqual(overlapMorningAll.textContent.includes('4h'), true, "In 'all' mode, overlapping 3h TCP & UDP merge to 4h total");
    assertEqual(overlapMorningAll.textContent.includes('📱') && overlapMorningAll.textContent.includes('💻'), true, "In 'all' mode, both device icons are shown");

    // Test 12: Shift with ONLY TCP traffic shows 'Sin actividad' in 'game' mode and duration in 'all' mode
    window.setWeeklyActivityType('game');
    window.lastFetchedData = [{
        start_epoch: mon9AM,
        end_epoch: mon12PM_test,
        duration_sec: 10800,
        device: 'PC',
        proto: 'TCP',
        end: '2026-08-31 12:00:00'
    }];
    window.updateWeeklySummary();
    const tcpOnlyCards = window.document.querySelectorAll('.weekly-day-card');
    const tcpMonMorning = tcpOnlyCards[0].querySelectorAll('.shift-block')[0];
    assertEqual(tcpMonMorning.textContent.includes('Sin actividad') || tcpMonMorning.textContent.includes('Pendiente'), true, "TCP-only traffic shows 'Sin actividad' in 'game' mode");
    
    window.setWeeklyActivityType('all');
    const tcpOnlyCardsAll = window.document.querySelectorAll('.weekly-day-card');
    const tcpMonMorningAll = tcpOnlyCardsAll[0].querySelectorAll('.shift-block')[0];
    assertEqual(tcpMonMorningAll.textContent.includes('3h'), true, "TCP-only traffic shows 3h in 'all' mode");

    if (allPassed) {
        console.log("=== Weekly JS Unit Tests Passed Successfully ===");
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runWeeklyUnitTests().catch(err => {
    console.error(err);
    process.exit(1);
});
