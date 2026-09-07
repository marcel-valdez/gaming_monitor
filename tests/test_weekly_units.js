const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function runWeeklyUnitTests() {
    console.log("=== Running Weekly JS Unit Tests ===");
    const html = `<!DOCTYPE html><html><body>
        <div id="tab-weekly">
            <div id="weekly-grid"></div>
            <div id="weekly-range-label"></div>
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
    assertEqual(weeklyTotalEl.innerText, "0s", "Weekly total should be 0s for empty week");

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
        assertEqual(realMonAfternoon.textContent.includes('5:12 PM'), true, "Monday Aug 31 starts at 5:12 PM");

        // Test 11: Sunday Sep 6 real data duration should never exceed physical span (~13h 22m, not 23h 37m)
        const realSunCard = cardsWithData[6];
        const sunShiftBlocks = realSunCard.querySelectorAll('.shift-block');
        const sunMorning = sunShiftBlocks[0];
        const sunAfternoon = sunShiftBlocks[1];
        const sunTotal = realSunCard.querySelector('.day-total-footer').textContent;

        assertEqual(sunMorning.textContent.includes('4h'), true, "Sunday morning should be ~4h 40m, not 8h 58m");
        assertEqual(!sunMorning.textContent.includes('8h'), true, "Sunday morning must not double count to 8h");
        assertEqual(sunAfternoon.textContent.includes('8h'), true, "Sunday afternoon should be ~8h 40m, not 14h 39m");
        assertEqual(!sunAfternoon.textContent.includes('14h'), true, "Sunday afternoon must not double count to 14h");
        assertEqual(sunTotal.includes('13h'), true, "Sunday total should be ~13h, not 23h");
        assertEqual(!sunTotal.includes('23h'), true, "Sunday total must not be inflated to 23h");
    }

    // Test 9: mergeIntervals and computeMergedDuration utility functions
    const testIntervals1 = [[100, 300], [200, 400]]; // overlaps
    assertEqual(window.computeMergedDuration(testIntervals1), 300, "Overlapping intervals [100,300] and [200,400] merge to 300s");
    const testIntervals2 = [[100, 500], [200, 300], [250, 400]]; // subsumed
    assertEqual(window.computeMergedDuration(testIntervals2), 400, "Subsumed intervals merge to [100, 500] (400s)");
    const testIntervals3 = [[300, 400], [100, 200]]; // disjoint unsorted
    assertEqual(window.computeMergedDuration(testIntervals3), 200, "Disjoint unsorted intervals merge to 200s");

    // Test 10: Overlapping concurrent sessions in a shift (e.g. 9:00 AM-12:00 PM and 10:00 AM-1:00 PM)
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
    window.updateWeeklySummary();
    const overlapCards = window.document.querySelectorAll('.weekly-day-card');
    const overlapMonCard = overlapCards[0];
    const overlapMorning = overlapMonCard.querySelectorAll('.shift-block')[0];
    assertEqual(overlapMorning.textContent.includes('4h'), true, "Overlapping 3h sessions from 9-12 and 10-1 merge to 4h total (not 6h)");
    assertEqual(!overlapMorning.textContent.includes('6h'), true, "Must not sum to 6h");

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
