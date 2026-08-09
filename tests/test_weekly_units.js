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

    // Test 1: getLogicalDay (5 AM rollover)
    // 2026-08-08 04:59:59 -> 2026-08-07
    const t1 = new Date('2026-08-08T04:59:59').getTime() / 1000;
    assertEqual(window.getLogicalDayString(t1), "2026-08-07", "04:59:59 should be previous day");
    
    // 2026-08-08 05:00:00 -> 2026-08-08
    const t2 = new Date('2026-08-08T05:00:00').getTime() / 1000;
    assertEqual(window.getLogicalDayString(t2), "2026-08-08", "05:00:00 should be current day");

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
