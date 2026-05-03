const API_URL = 'http://localhost:5000/optimize';

const calculateBtn = document.getElementById('calculateBtn');
const addFdBtn = document.getElementById('addFdBtn');
const fdRowsContainer = document.getElementById('fdRows');
const loadingState = document.getElementById('loadingState');
const errorBanner = document.getElementById('errorBanner');
const resultArea = document.getElementById('resultArea');
const investedAmountDisplay = document.getElementById('investedAmountDisplay');
const emergencyReservedDisplay = document.getElementById('emergencyReservedDisplay');
const totalReturnDisplay = document.getElementById('totalReturnDisplay');
const fdCards = document.getElementById('fdCards');
const stepLog = document.getElementById('stepLog');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── FD Row Management ─────────────────────────────────────────────────────────

let fdRowCount = 0;

function addFdRow(defaultDuration = '', defaultRate = '') {
    fdRowCount++;
    const id = fdRowCount;
    const row = document.createElement('div');
    row.className = 'fd-row';
    row.id = `fd-row-${id}`;
    row.innerHTML = `
        <div class="fd-row-inputs">
            <div class="input-group small">
                <label for="fd-dur-${id}">Duration (yrs)</label>
                <input type="number" id="fd-dur-${id}" class="fd-duration" placeholder="e.g. 3" min="1" step="1" value="${defaultDuration}">
            </div>
            <div class="input-group small">
                <label for="fd-rate-${id}">Rate (%)</label>
                <input type="number" id="fd-rate-${id}" class="fd-rate" placeholder="e.g. 7.5" min="0.01" step="0.01" value="${defaultRate}">
            </div>
            <button class="btn-remove" type="button" onclick="removeFdRow(${id})">✕</button>
        </div>
    `;
    fdRowsContainer.appendChild(row);
}

function removeFdRow(id) {
    if (fdRowsContainer.children.length <= 1) {
        showError('You need at least one FD option.');
        return;
    }
    document.getElementById(`fd-row-${id}`)?.remove();
}

addFdRow(1, 7.0);
addFdRow(3, 8.5);
addFdBtn.addEventListener('click', () => addFdRow());

// ── UI State Helpers ──────────────────────────────────────────────────────────

function setLoading(isLoading) {
    calculateBtn.disabled = isLoading;
    calculateBtn.textContent = isLoading ? 'Calculating…' : 'Calculate Optimal Investment';
    loadingState.style.display = isLoading ? 'flex' : 'none';
}

function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
    resultArea.style.display = 'none';
}

function clearError() {
    errorBanner.textContent = '';
    errorBanner.style.display = 'none';
}

// ── Input Collection ──────────────────────────────────────────────────────────

function collectInputs() {
    const totalAmount = parseFloat(document.getElementById('investmentAmount').value);
    const timeHorizon = parseInt(document.getElementById('timeHorizon').value, 10);
    const emergencyFund = parseFloat(document.getElementById('emergencyFund').value) || 0;

    if (isNaN(totalAmount) || totalAmount <= 0) throw new Error('Please enter a valid total investment amount.');
    if (isNaN(timeHorizon) || timeHorizon <= 0) throw new Error('Please enter a valid time horizon.');
    if (emergencyFund < 0 || emergencyFund >= totalAmount) throw new Error('Emergency fund must be ≥ 0 and less than total amount.');

    const fds = [];
    const durationInputs = fdRowsContainer.querySelectorAll('.fd-duration');
    const rateInputs = fdRowsContainer.querySelectorAll('.fd-rate');

    durationInputs.forEach((durInput, i) => {
        const duration = parseInt(durInput.value, 10);
        const rate = parseFloat(rateInputs[i].value);
        if (isNaN(duration) || duration <= 0) throw new Error(`FD option ${i + 1}: duration must be a positive integer.`);
        if (isNaN(rate) || rate <= 0 || rate >= 100) throw new Error(`FD option ${i + 1}: rate must be between 0 and 100.`);
        fds.push({ duration, rate: rate / 100 });
    });

    if (fds.length === 0) throw new Error('Add at least one FD option.');
    return { total_amount: totalAmount, time_horizon: timeHorizon, emergency_fund: emergencyFund, fds };
}

// ── Visualization ─────────────────────────────────────────────────────────────

/** Render one card per FD option; returns a map of fd-label → card element */
function renderFdCards(fds) {
    fdCards.innerHTML = '';
    const cardMap = {};
    fds.forEach((fd, i) => {
        const label = `${fd.duration}Y ${(fd.rate * 100).toFixed(1)}%`;
        const card = document.createElement('div');
        card.className = 'fd-card';
        card.id = `fd-card-${i}`;
        card.innerHTML = `
            <span class="fd-card-duration">${fd.duration}Y</span>
            <span class="fd-card-rate">${(fd.rate * 100).toFixed(1)}%</span>
        `;
        fdCards.appendChild(card);
        cardMap[label] = card;
    });
    return cardMap;
}

/** Append a line to the step log with a fade-in */
function appendStep(text, type = 'info') {
    const line = document.createElement('div');
    line.className = `step-line step-${type}`;
    line.textContent = text;
    stepLog.appendChild(line);
    // trigger reflow then animate in
    requestAnimationFrame(() => line.classList.add('visible'));
}

/** Animate through steps returned by the backend */
async function animateSteps(steps, cardMap, payload) {
    stepLog.innerHTML = '';

    // Show all cards as idle first
    Object.values(cardMap).forEach(c => c.className = 'fd-card');

    appendStep(`💰 Investable amount: ₹${(payload.total_amount - payload.emergency_fund).toLocaleString()}`, 'info');
    await sleep(600);

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const card = cardMap[step.fd];

        // Highlight selected card
        if (card) {
            card.classList.add('fd-card--selected');
        }

        appendStep(`Step ${i + 1}: Selected ${step.fd} FD — Allocated ₹${step.allocated.toLocaleString()}`, 'selected');
        await sleep(700);

        if (step.remaining > 0) {
            appendStep(`  Remaining balance: ₹${step.remaining.toLocaleString()}`, 'info');
            await sleep(500);
        } else {
            appendStep(`  Fully allocated — no balance remaining ✓`, 'success');
            await sleep(500);
        }
    }
}

// ── Main Click Handler ────────────────────────────────────────────────────────

calculateBtn.addEventListener('click', async () => {
    clearError();
    resultArea.style.display = 'none';

    let payload;
    try {
        payload = collectInputs();
    } catch (err) {
        showError(err.message);
        return;
    }

    setLoading(true);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (!response.ok) {
            showError(`Server error: ${data.error ?? response.statusText}`);
            return;
        }

        // Show result area immediately so cards render
        resultArea.style.display = 'block';

        // Render FD cards from user's input
        const cardMap = renderFdCards(payload.fds);

        // Populate summary stats
        investedAmountDisplay.textContent = `₹${(payload.total_amount - payload.emergency_fund).toLocaleString()}`;
        emergencyReservedDisplay.textContent = `₹${payload.emergency_fund.toLocaleString()}`;
        totalReturnDisplay.textContent = `₹${data.total_return.toLocaleString()}`;

        // Animate steps
        setLoading(false);
        await animateSteps(data.steps, cardMap, payload);

    } catch (err) {
        showError('Could not reach the backend. Is app.py running?');
        setLoading(false);
    } finally {
        setLoading(false);
    }
});
