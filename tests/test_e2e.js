const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function runTest() {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    const dataJson = fs.readFileSync(path.join(__dirname, '../public/data.json'), 'utf8');

    const dom = new JSDOM(html, {
        runScripts: "dangerously",
        resources: "usable",
        url: "http://localhost:8080/"
    });

    const { window } = dom;
    global.window = window;
    global.document = window.document;
    global.navigator = window.navigator;

    // Mock fetch
    window.fetch = async (url) => {
        if (url.startsWith('data.json')) {
            return {
                json: async () => JSON.parse(dataJson)
            };
        }
        throw new Error(`Unhandled fetch to ${url}`);
    };

    // Execute app.js in the JSDOM context
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.body.appendChild(script);

    // Give it a moment to render
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify DOM
    const dashboard = window.document.getElementById('dashboard');
    const dayCards = dashboard.querySelectorAll('.day-card');
    
    console.log(`Checking dashboard... found ${dayCards.length} day cards.`);
    
    if (dayCards.length === 0) {
        console.error("FAIL: No day cards found in dashboard.");
        process.exit(1);
    }

    const rows = dashboard.querySelectorAll('tr');
    console.log(`Found ${rows.length} rows (including headers).`);

    const htmlContent = dashboard.innerHTML;
    // The mock data should have 2 sessions: Phone (Active) and PC (Ended)
    const activeBadgeCount = (htmlContent.match(/🟢 Activa/g) || []).length;
    console.log(`Found ${activeBadgeCount} active badges.`);
    
    let allPassed = true;
    if (activeBadgeCount !== 1) {
        console.error(`FAIL: Expected 1 active badge, found ${activeBadgeCount}`);
        allPassed = false;
    }

    const durationCells = dashboard.querySelectorAll('.duration');
    console.log(`Found ${durationCells.length} duration cells.`);
    
    // Check that at least one duration is NOT '...' (rendered)
    let foundEndedDuration = false;
    durationCells.forEach(cell => {
        if (!cell || cell.classList.contains('active-duration')) return;
        
        const text = cell.textContent || "";
        if (text.includes('s')) {
            foundEndedDuration = true;
            console.log(`✅ PASS: Found ended duration: ${text}`);
        }
    });

    if (!foundEndedDuration) {
        console.error("FAIL: Could not find any rendered duration for ended session.");
        allPassed = false;
    }

    const checks = [
        { name: "Phone Device", pattern: /📱 Celular/ },
        { name: "PC Device", pattern: /💻 PC/ },
        { name: "Gameplay Status", pattern: /🎮 Jugando \(Activo\)/ },
        { name: "Menu Status", pattern: /⚙️ Menús \/ Chat/ }
    ];

    checks.forEach(check => {
        if (check.pattern.test(htmlContent)) {
            console.log(`✅ PASS: Found ${check.name}`);
        } else {
            console.error(`❌ FAIL: Could not find ${check.name}`);
            allPassed = false;
        }
    });

    console.log("Verifying tabs existence and switching behavior...");
    const tabHistory = window.document.getElementById('tab-history');
    const tabStats = window.document.getElementById('tab-stats');
    const tabBtnHistory = window.document.getElementById('tab-btn-history');
    const tabBtnStats = window.document.getElementById('tab-btn-stats');

    if (!tabHistory || !tabStats || !tabBtnHistory || !tabBtnStats) {
        console.error("FAIL: Tab button or content containers not found in HTML.");
        allPassed = false;
    } else {
        // Default state: History tab active, stats tab inactive
        if (!tabHistory.classList.contains('active') || tabStats.classList.contains('active')) {
            console.error("FAIL: Default active tab state is incorrect.");
            allPassed = false;
        }

        // Simulate tab click to switch to stats
        window.switchTab('stats');
        if (tabHistory.classList.contains('active') || !tabStats.classList.contains('active')) {
            console.error("FAIL: switchTab('stats') failed to activate stats tab.");
            allPassed = false;
        }

        // Simulate tab click to switch back to history
        window.switchTab('history');
        if (!tabHistory.classList.contains('active') || tabStats.classList.contains('active')) {
            console.error("FAIL: switchTab('history') failed to restore history tab.");
            allPassed = false;
        }
    }

    console.log("Verifying day header total play time display...");
    const dayTotalElement = window.document.querySelector('.day-total');
    if (!dayTotalElement) {
        console.error("FAIL: Daily total played badge (.day-total) not found in day headers.");
        allPassed = false;
    } else {
        const text = dayTotalElement.textContent;
        console.log(`Found day total text: "${text}"`);
        if (!text.includes('Total Jugado')) {
            console.error(`FAIL: Daily total played text format is incorrect. Found: ${text}`);
            allPassed = false;
        }
    }

    console.log("Verifying calculated statistics elements on Stats tab...");
    const statsValueIds = [
        'stat-weekly-total',
        'stat-monthly-total',
        'stat-weekday-avg',
        'stat-weekend-avg',
        'stat-weekday-start-avg',
        'stat-weekend-start-avg',
        'stat-weekday-end-avg'
    ];

    statsValueIds.forEach(id => {
        const el = window.document.getElementById(id);
        if (!el) {
            console.error(`FAIL: Statistic container with ID #${id} not found.`);
            allPassed = false;
        } else {
            console.log(`✅ PASS: Found stat ID #${id} with value "${el.innerText}"`);
        }
    });

    if (allPassed) {
        console.log("=== E2E Rendering Test Successful ===");
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
