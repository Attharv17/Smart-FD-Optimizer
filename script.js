const API_URL = 'http://localhost:5000/optimize';

// ── DOM Refs ─────────────────────────────────────────────────────────────────

const calculateBtn           = document.getElementById('calculateBtn');
const calcBtnLabel           = document.getElementById('calcBtnLabel');
const addFdBtn               = document.getElementById('addFdBtn');
const fdRowsContainer        = document.getElementById('fdRows');
const loadingState           = document.getElementById('loadingState');
const loadingMsg             = document.getElementById('loadingMsg');
const errorBanner            = document.getElementById('errorBanner');
const strategyBadge          = document.getElementById('strategyBadge');
const resultArea             = document.getElementById('resultArea');
const compareArea            = document.getElementById('compareArea');

// Single-mode els
const investedAmountDisplay  = document.getElementById('investedAmountDisplay');
const emergencyReservedDisplay = document.getElementById('emergencyReservedDisplay');
const totalReturnDisplay     = document.getElementById('totalReturnDisplay');
const fdCards                = document.getElementById('fdCards');
const stepLog                = document.getElementById('stepLog');
const fdCardsSection         = document.getElementById('fdCardsSection');
const stepLogSection         = document.getElementById('stepLogSection');
const treeSection            = document.getElementById('treeSection');
const treeCanvas             = document.getElementById('treeCanvas');
const bestPathSummary        = document.getElementById('bestPathSummary');

// Compare-mode els
const cmpInvested            = document.getElementById('cmpInvested');
const cmpEmergency           = document.getElementById('cmpEmergency');
const cmpGreedyReturn        = document.getElementById('cmpGreedyReturn');
const cmpBtReturn            = document.getElementById('cmpBtReturn');
const cmpFdCards             = document.getElementById('cmpFdCards');
const cmpStepLog             = document.getElementById('cmpStepLog');
const cmpTreeCanvas          = document.getElementById('cmpTreeCanvas');
const cmpBestPathSummary     = document.getElementById('cmpBestPathSummary');
const cmpGreedyWinner        = document.getElementById('cmpGreedyWinner');
const cmpBtWinner            = document.getElementById('cmpBtWinner');

// ── Mode Toggle ───────────────────────────────────────────────────────────────

let currentMode = 'greedy';

const modeHints = {
    greedy:       'Picks the highest-rate FD that fits your horizon — fast and deterministic.',
    backtracking: 'Explores every combination recursively to find the globally optimal return.',
    compare:      'Runs both algorithms and shows results side-by-side so you can compare.'
};

const modeButtonLabels = {
    greedy:       'Calculate — Greedy',
    backtracking: 'Calculate — Backtracking',
    compare:      'Run Both & Compare'
};

const strategyLabels = {
    greedy:       { text: '⚡ Greedy Mode',       cls: 'badge--greedy' },
    backtracking: { text: '🌳 Backtracking Mode',  cls: 'badge--bt'     },
    compare:      { text: '⚖️ Comparing Both',     cls: 'badge--compare' }
};

const modeCards = document.querySelectorAll('.mode-card');
const modeHintEl = document.getElementById('modeHint');

modeCards.forEach(card => {
    card.addEventListener('click', () => {
        modeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        currentMode = card.dataset.mode;
        modeHintEl.textContent = modeHints[currentMode];
        calcBtnLabel.textContent = modeButtonLabels[currentMode];
    });
});

// ── Utilities ─────────────────────────────────────────────────────────────────

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
            <button class="btn-remove" type="button" onclick="removeFdRow(${id})" title="Remove">✕</button>
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

// ── UI Helpers ────────────────────────────────────────────────────────────────

function setLoading(on, msg = 'Contacting backend…') {
    calculateBtn.disabled      = on;
    loadingState.style.display = on ? 'flex' : 'none';
    loadingMsg.textContent     = msg;
}

function showError(msg) {
    errorBanner.textContent    = msg;
    errorBanner.style.display  = 'block';
    resultArea.style.display   = 'none';
    compareArea.style.display  = 'none';
    strategyBadge.style.display = 'none';
}

function clearError() {
    errorBanner.textContent   = '';
    errorBanner.style.display = 'none';
}

function showBadge(mode) {
    const { text, cls } = strategyLabels[mode];
    strategyBadge.textContent = text;
    strategyBadge.className   = `strategy-badge ${cls}`;
    strategyBadge.style.display = 'inline-flex';
}

// ── Input Collection ──────────────────────────────────────────────────────────

function collectInputs() {
    const totalAmount   = parseFloat(document.getElementById('investmentAmount').value);
    const timeHorizon   = parseInt(document.getElementById('timeHorizon').value, 10);
    const emergencyFund = parseFloat(document.getElementById('emergencyFund').value) || 0;

    if (isNaN(totalAmount) || totalAmount <= 0) throw new Error('Please enter a valid total investment amount.');
    if (isNaN(timeHorizon) || timeHorizon <= 0)  throw new Error('Please enter a valid time horizon.');
    if (emergencyFund < 0 || emergencyFund >= totalAmount) throw new Error('Emergency fund must be ≥ 0 and less than total amount.');

    const fds = [];
    const durationInputs = fdRowsContainer.querySelectorAll('.fd-duration');
    const rateInputs     = fdRowsContainer.querySelectorAll('.fd-rate');

    durationInputs.forEach((durInput, i) => {
        const duration = parseInt(durInput.value, 10);
        const rate     = parseFloat(rateInputs[i].value);
        if (isNaN(duration) || duration <= 0)         throw new Error(`FD option ${i + 1}: duration must be a positive integer.`);
        if (isNaN(rate) || rate <= 0 || rate >= 100) throw new Error(`FD option ${i + 1}: rate must be between 0 and 100.`);
        fds.push({ duration, rate: rate / 100 });
    });

    if (fds.length === 0) throw new Error('Add at least one FD option.');
    return { total_amount: totalAmount, time_horizon: timeHorizon, emergency_fund: emergencyFund, fds };
}

// ── API Calls ─────────────────────────────────────────────────────────────────

async function fetchMode(payload, mode) {
    const res  = await fetch(`${API_URL}?mode=${mode}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    return data;
}

// ── Greedy Visualization ──────────────────────────────────────────────────────

function renderFdCards(container, fds) {
    container.innerHTML = '';
    const cardMap = {};
    fds.forEach((fd, i) => {
        const label = `${fd.duration}Y ${(fd.rate * 100).toFixed(1)}%`;
        const card  = document.createElement('div');
        card.className = 'fd-card';
        card.id = `fd-card-${container.id}-${i}`;
        card.innerHTML = `
            <span class="fd-card-duration">${fd.duration}Y</span>
            <span class="fd-card-rate">${(fd.rate * 100).toFixed(1)}%</span>
        `;
        container.appendChild(card);
        cardMap[label] = card;
    });
    return cardMap;
}

function appendStep(container, text, type = 'info') {
    const line = document.createElement('div');
    line.className = `step-line step-${type}`;
    line.textContent = text;
    container.appendChild(line);
    requestAnimationFrame(() => line.classList.add('visible'));
}

async function animateSteps(stepLogEl, steps, cardMap, investable) {
    stepLogEl.innerHTML = '';
    Object.values(cardMap).forEach(c => c.className = 'fd-card');

    appendStep(stepLogEl, `💰 Investable: ₹${investable.toLocaleString()}`, 'info');
    await sleep(500);

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const card = cardMap[step.fd];
        if (card) card.classList.add('fd-card--selected');

        appendStep(stepLogEl, `Step ${i + 1}: ${step.fd} → ₹${step.allocated.toLocaleString()}`, 'selected');
        await sleep(650);

        if (step.remaining > 0) {
            appendStep(stepLogEl, `  Remaining: ₹${step.remaining.toLocaleString()}`, 'info');
        } else {
            appendStep(stepLogEl, `  Fully allocated ✓`, 'success');
        }
        await sleep(400);
    }
}

// ── Decision Tree Layout & Rendering ─────────────────────────────────────────

const NODE_W     = 126;
const NODE_H     = 60;
const H_GAP      = 14;
const V_GAP      = 58;
const STEP_DELAY = 380;

function buildTreeStructure(nodes, edges) {
    const childrenOf = {};
    const nodeById   = {};
    nodes.forEach(n => { childrenOf[n.id] = []; nodeById[n.id] = n; });
    edges.forEach(e => childrenOf[e.from_id].push(e.to_id));
    return { childrenOf, nodeById };
}

function subtreeWidth(nid, childrenOf) {
    const kids = childrenOf[nid];
    if (!kids.length) return NODE_W;
    const total = kids.reduce((s, c) => s + subtreeWidth(c, childrenOf), 0) + H_GAP * (kids.length - 1);
    return Math.max(NODE_W, total);
}

function layoutTree(nid, x, y, childrenOf, positions) {
    positions[nid] = { x, y };
    const kids = childrenOf[nid];
    if (!kids.length) return;
    const total = kids.reduce((s, c) => s + subtreeWidth(c, childrenOf), 0) + H_GAP * (kids.length - 1);
    let cx = x - total / 2;
    kids.forEach(cid => {
        const sw = subtreeWidth(cid, childrenOf);
        layoutTree(cid, cx + sw / 2, y + NODE_H + V_GAP, childrenOf, positions);
        cx += sw + H_GAP;
    });
}

function canvasDimensions(positions) {
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.values(positions).forEach(({ x, y }) => {
        minX = Math.min(minX, x - NODE_W / 2);
        maxX = Math.max(maxX, x + NODE_W / 2);
        maxY = Math.max(maxY, y + NODE_H);
    });
    return { width: maxX - minX, height: maxY, offsetX: -minX };
}

async function animateDecisionTree(canvasEl, summaryEl, nodes, edges, bestPathIds, bestValue) {
    canvasEl.innerHTML = '';
    if (summaryEl) { summaryEl.style.display = 'none'; summaryEl.classList.remove('bps--visible'); }

    if (!nodes?.length) {
        canvasEl.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No tree data.</p>';
        return;
    }

    const { childrenOf, nodeById } = buildTreeStructure(nodes, edges);
    const rootId  = nodes[0].id;
    const bestSet = new Set(bestPathIds);

    const positions = {};
    layoutTree(rootId, 0, 0, childrenOf, positions);
    const { width, height, offsetX } = canvasDimensions(positions);

    const PAD = 16;
    const W   = width + PAD * 2;
    const H   = height + PAD * 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;';
    canvasEl.style.cssText = `position:relative;width:${W}px;height:${H}px;`;
    canvasEl.appendChild(svg);

    // BFS order
    const bfsOrder = [];
    const q = [rootId];
    while (q.length) {
        const nid = q.shift();
        bfsOrder.push(nid);
        childrenOf[nid].forEach(c => q.push(c));
    }

    function nodeState(nid) {
        if (nid === rootId) return 'root';
        if (bestSet.has(nid)) return 'best';
        return childrenOf[nid].length === 0 ? 'rejected' : 'explored';
    }

    // Build DOM nodes
    const nodeEls = {};
    bfsOrder.forEach(nid => {
        const node = nodeById[nid];
        const pos  = positions[nid];
        const x    = pos.x + offsetX + PAD - NODE_W / 2;
        const y    = pos.y + PAD;

        const el = document.createElement('div');
        el.className       = 'tree-node tree-node--hidden';
        el.dataset.state   = nodeState(nid);
        el.style.cssText   = `left:${x}px;top:${y}px;width:${NODE_W}px;height:${NODE_H}px;position:absolute;`;
        el.innerHTML = `
            <span class="tn-fd">${node.fd === 'Start' ? '🌱 Start' : `📌 ${node.fd}`}</span>
            <span class="tn-val">₹${node.value.toLocaleString()}</span>
        `;
        canvasEl.appendChild(el);
        nodeEls[nid] = { el, cx: pos.x + offsetX + PAD, cy: pos.y + PAD };
    });

    // Animate BFS
    for (const nid of bfsOrder) {
        if (nid !== rootId) await sleep(STEP_DELAY);

        const { el, cx, cy } = nodeEls[nid];
        el.classList.replace('tree-node--hidden', 'tree-node--visible');

        const node = nodeById[nid];
        if (node.parent_id != null) {
            const { cx: px, cy: py } = nodeEls[node.parent_id];
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', px); line.setAttribute('y1', py + NODE_H);
            line.setAttribute('x2', cx); line.setAttribute('y2', cy);
            const isBest = bestSet.has(nid) && bestSet.has(node.parent_id);
            line.setAttribute('class', `tree-edge ${isBest ? 'tree-edge--best' : 'tree-edge--grey'}`);
            svg.appendChild(line);
        }
        await sleep(55);
    }

    // Apply final colour states
    await sleep(260);
    bfsOrder.forEach(nid => {
        nodeEls[nid].el.classList.add(`tree-node--${nodeEls[nid].el.dataset.state}`);
    });

    // Best path summary
    if (summaryEl) {
        await sleep(420);
        const pathFds = bestPathIds.map(id => nodeById[id]).filter(Boolean).slice(1).map(n => n.fd);
        summaryEl.innerHTML = `
            <div class="bps-title">🏆 Best Path Found</div>
            <div class="bps-steps">${pathFds.join(' → ') || '(no FD fits the horizon)'}</div>
            <div class="bps-value">Return: <strong>₹${bestValue.toLocaleString()}</strong></div>
        `;
        summaryEl.style.display = 'block';
        requestAnimationFrame(() => summaryEl.classList.add('bps--visible'));
    }
}

// ── Main Click Handler ────────────────────────────────────────────────────────

calculateBtn.addEventListener('click', async () => {
    clearError();
    resultArea.style.display  = 'none';
    compareArea.style.display = 'none';
    strategyBadge.style.display = 'none';

    let payload;
    try {
        payload = collectInputs();
    } catch (err) {
        showError(err.message);
        return;
    }

    const investable = payload.total_amount - payload.emergency_fund;

    // ── Compare mode ────────────────────────────────────────────────────────
    if (currentMode === 'compare') {
        setLoading(true, 'Running both algorithms…');
        showBadge('compare');

        try {
            const [gData, btData] = await Promise.all([
                fetchMode(payload, 'greedy'),
                fetchMode(payload, 'backtracking')
            ]);

            setLoading(false);
            compareArea.style.display = 'block';

            // Shared stats
            cmpInvested.textContent  = `₹${investable.toLocaleString()}`;
            cmpEmergency.textContent = `₹${payload.emergency_fund.toLocaleString()}`;

            // Returns
            cmpGreedyReturn.textContent = `₹${gData.total_return.toLocaleString()}`;
            cmpBtReturn.textContent     = `₹${btData.best_value.toLocaleString()}`;

            // Winner badge
            cmpGreedyWinner.style.display = 'none';
            cmpBtWinner.style.display     = 'none';
            if (gData.total_return >= btData.best_value) {
                cmpGreedyWinner.style.display = 'inline-flex';
            } else {
                cmpBtWinner.style.display = 'inline-flex';
            }

            // Greedy side
            const cmpCardMap = renderFdCards(cmpFdCards, payload.fds);
            animateSteps(cmpStepLog, gData.steps, cmpCardMap, investable);

            // Backtracking side
            animateDecisionTree(
                cmpTreeCanvas, cmpBestPathSummary,
                btData.nodes, btData.edges,
                btData.best_path_ids, btData.best_value
            );

        } catch (err) {
            showError(`Error: ${err.message}`);
            setLoading(false);
        } finally {
            setLoading(false);
        }
        return;
    }

    // ── Single mode (greedy or backtracking) ─────────────────────────────────
    setLoading(true);
    showBadge(currentMode);

    try {
        const data = await fetchMode(payload, currentMode);

        resultArea.style.display = 'block';
        investedAmountDisplay.textContent    = `₹${investable.toLocaleString()}`;
        emergencyReservedDisplay.textContent = `₹${payload.emergency_fund.toLocaleString()}`;

        setLoading(false);

        if (currentMode === 'backtracking') {
            fdCardsSection.style.display = 'none';
            stepLogSection.style.display = 'none';
            treeSection.style.display    = 'block';
            totalReturnDisplay.textContent = `₹${data.best_value.toLocaleString()}`;
            await animateDecisionTree(treeCanvas, bestPathSummary, data.nodes, data.edges, data.best_path_ids, data.best_value);

        } else {
            fdCardsSection.style.display = 'block';
            stepLogSection.style.display = 'block';
            treeSection.style.display    = 'none';
            totalReturnDisplay.textContent = `₹${data.total_return.toLocaleString()}`;
            const cardMap = renderFdCards(fdCards, payload.fds);
            await animateSteps(stepLog, data.steps, cardMap, investable);
        }

    } catch (err) {
        showError(`Could not reach the backend. Is app.py running? (${err.message})`);
        setLoading(false);
    } finally {
        setLoading(false);
    }
});
