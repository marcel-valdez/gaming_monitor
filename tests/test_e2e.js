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
        url: "http://test-local/"
    });

    const { window } = dom;
    global.window = window;
    global.document = window.document;
    global.navigator = window.navigator;

    let currentFetchData = dataJson;

    // Mock fetch
    window.fetch = async (url) => {
        if (url.startsWith('data.json')) {
            return {
                json: async () => JSON.parse(currentFetchData)
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
        { name: "Gameplay Status", pattern: /🎮 En Juego Activo/ },
        { name: "Menu Status", pattern: /👨‍💻 Total En Juego/ }
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
    const dayTotals = window.document.querySelectorAll('.day-total');
    let foundActiveTotal = false;
    let foundAggregateTotal = false;

    dayTotals.forEach(span => {
        const text = span.textContent;
        console.log(`Found day total text: "${text}"`);
        if (text.includes('En Juego Activo')) foundActiveTotal = true;
        if (text.includes('Total En Juego')) foundAggregateTotal = true;
    });

    if (!foundActiveTotal) {
        console.error("❌ FAIL: Could not find 'En Juego Activo' total in day header");
        allPassed = false;
    } else {
        console.log("✅ PASS: Found 'En Juego Activo' total in day header");
    }

    if (!foundAggregateTotal) {
        console.error("❌ FAIL: Could not find 'Total En Juego' total in day header");
        allPassed = false;
    } else {
        console.log("✅ PASS: Found 'Total En Juego' total in day header");
    }

    console.log("Verifying tab filters presence in HTML...");
    const timeFilters = window.document.getElementById('time-filters');
    const typeFilters = window.document.getElementById('type-filters');
    if (!timeFilters || !typeFilters) {
        console.error("FAIL: Time or Type filter containers not found in HTML.");
        allPassed = false;
    }

    console.log("Verifying weekly stats banner...");
    const weeklyBanner = window.document.getElementById('stat-weekly-hours-avg');
    if (!weeklyBanner) {
        console.error("FAIL: Weekly average hours banner not found.");
        allPassed = false;
    }

    console.log("Verifying updated daily logical day stats elements...");
    const dailyStatsValueIds = [
        'stat-mon-thu-start', 'stat-mon-thu-end', 'stat-mon-thu-duration',
        'stat-fri-start', 'stat-fri-end', 'stat-fri-duration',
        'stat-sat-start', 'stat-sat-end', 'stat-sat-duration',
        'stat-sun-start', 'stat-sun-end', 'stat-sun-duration'
    ];

    dailyStatsValueIds.forEach(id => {
        const el = window.document.getElementById(id);
        if (!el) {
            console.error(`FAIL: Advanced daily statistic container #${id} not found.`);
            allPassed = false;
        } else {
            console.log(`✅ PASS: Found advanced daily stat ID #${id} with value "${el.innerText}"`);
        }
    });

    console.log("Testing filter interaction functions...");
    if (typeof window.setStatsTimeWindow === 'function' && typeof window.setStatsActivityType === 'function') {
        window.setStatsTimeWindow(90);
        window.setStatsActivityType('game');
        console.log("✅ PASS: Filter interaction handlers are defined and executed without error.");
    } else {
        console.error("FAIL: setStatsTimeWindow or setStatsActivityType is not defined globally.");
        allPassed = false;
    }

    console.log("Verifying rollover and timezone logic with custom mock data...");
    
    // Compute dynamic relative epochs forced to Saturday reference
    const nowRef = new Date();
    const dayDiff = nowRef.getDay() - 6; // difference since Saturday (6)
    nowRef.setDate(nowRef.getDate() - dayDiff);

    const thuRef = new Date(nowRef);
    thuRef.setDate(nowRef.getDate() - 2);
    thuRef.setHours(23, 0, 0, 0);
    const thuEpoch = Math.floor(thuRef.getTime() / 1000);

    const friRef = new Date(nowRef);
    friRef.setDate(nowRef.getDate() - 1);
    friRef.setHours(2, 0, 0, 0);
    const friEpoch = Math.floor(friRef.getTime() / 1000);

    const testData = [
        {
            "date": "07 de agosto de 2026",
            "start_time_fmt": "2:00 AM",
            "start_epoch": friEpoch, 
            "proto": "UDP",
            "device": "Phone",
            "end": "03:30:00",
            "end_time_fmt": "3:30 AM",
            "duration_sec": 5400, // 1.5 hours
            "duration_str": "1h 30m 0s"
        },
        {
            "date": "06 de agosto de 2026",
            "start_time_fmt": "11:00 PM",
            "start_epoch": thuEpoch,
            "proto": "UDP",
            "device": "PC",
            "end": "01:30:00",
            "end_time_fmt": "1:30 AM",
            "duration_sec": 9000, // 2.5 hours
            "duration_str": "2h 30m 0s"
        }
    ];

    // Render this custom dataset
    currentFetchData = JSON.stringify(testData);
    await window.fetchData();

    // Verify Mon-Thu group values
    // Average start time: (23:00 + 26:00) / 2 = 24.5 hours = 12:30 AM next day
    // Average end time: (25.5 + 27.5) / 2 = 26.5 hours = 2:30 AM next day
    // Average playtime per unique logical day (Thursday had both, total playtime = 1.5 + 2.5 = 4.0 hours)
    const monThuStart = window.document.getElementById('stat-mon-thu-start').innerText;
    const monThuEnd = window.document.getElementById('stat-mon-thu-end').innerText;
    const monThuDuration = window.document.getElementById('stat-mon-thu-duration').innerText;

    console.log(`Logical Rollover - Mon-Thu Start: ${monThuStart}, End: ${monThuEnd}, Duration: ${monThuDuration}`);

    if (monThuStart !== "12:30 AM") {
        console.error(`FAIL: Expected Mon-Thu Average Start Time to be 12:30 AM, found ${monThuStart}`);
        allPassed = false;
    } else {
        console.log("✅ PASS: Mon-Thu Average Start Time is correct (12:30 AM)");
    }

    if (monThuEnd !== "2:30 AM") {
        console.error(`FAIL: Expected Mon-Thu Average End Time to be 2:30 AM, found ${monThuEnd}`);
        allPassed = false;
    } else {
        console.log("✅ PASS: Mon-Thu Average End Time is correct (2:30 AM)");
    }

    if (monThuDuration !== "4h 0m 0s") {
        console.error(`FAIL: Expected Mon-Thu Average Duration to be 4h 0m 0s, found ${monThuDuration}`);
        allPassed = false;
    } else {
        console.log("✅ PASS: Mon-Thu Average Duration is correct (4h 0m 0s)");
    }

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
