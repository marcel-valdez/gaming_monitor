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
        <div id="stat-weekly-hours-avg"></div>
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
