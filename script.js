document.addEventListener("DOMContentLoaded", () => {
    const API_URL = 'http://localhost:5000/optimize';

    // DOM refs with safe access wrapper
    const $ = id => document.getElementById(id);
    const safeAddClass = (el, cls) => { if (el) el.classList.add(cls); };
    const safeRemoveClass = (el, cls) => { if (el) el.classList.remove(cls); };
    const safeSetDisplay = (el, val) => { if (el) el.style.display = val; };

    const calculateBtn = $('calculateBtn'), calcBtnLabel = $('calcBtnLabel');
    const addFdBtn = $('addFdBtn'), fdRowsContainer = $('fdRows');
    const errorBanner = $('errorBanner'), strategyBadge = $('strategyBadge');
    
    const resultsSection = $('resultsSection');
    const greedyResultCard = $('greedyResultCard');
    const backtrackingResultCard = $('backtrackingResultCard');
    
    const greedyReturnDisplay = $('greedyReturnDisplay');
    const btReturnDisplay = $('btReturnDisplay');
    const greedyWinnerBadge = $('greedyWinnerBadge');
    const btWinnerBadge = $('btWinnerBadge');
    
    const greedyFdCards = $('greedyFdCards'), greedyStepLog = $('greedyStepLog');
    const btBestPathSummary = $('btBestPathSummary');

    const bottomSection = $('bottomSection');
    const greedyBottomCard = $('greedyBottomCard');
    const btBottomCard = $('btBottomCard');

    // Mode toggle
    let currentMode = 'greedy';
    const hints = {
        greedy: 'Picks the highest-rate FD that fits your horizon — fast and deterministic.',
        backtracking: 'Explores every combination recursively to find the globally optimal return.',
        compare: 'Runs both algorithms and shows results side-by-side.'
    };
    const btnLabels = { greedy: 'Calculate — Greedy', backtracking: 'Calculate — Backtracking', compare: 'Run Both & Compare' };
    const badgeInfo = {
        greedy: { text: '⚡ Greedy Mode', cls: 'badge--greedy' },
        backtracking: { text: '🌳 Backtracking Mode', cls: 'badge--bt' },
        compare: { text: '⚖️ Comparing Both', cls: 'badge--compare' }
    };

    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentMode = card.dataset.mode;
            if ($('modeHint')) $('modeHint').textContent = hints[currentMode];
            if (calcBtnLabel) calcBtnLabel.textContent = btnLabels[currentMode];
        });
    });

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let rowCount = 0;
    function addFdRow(dur = '', rate = '') {
        const id = ++rowCount;
        const row = document.createElement('div');
        row.className = 'fd-row'; row.id = `fd-row-${id}`;
        row.innerHTML = `<div class="fd-row-inputs">
            <div class="input-group small"><label>Duration (yrs)</label>
            <input type="number" class="fd-duration" placeholder="e.g. 3" min="1" step="1" value="${dur}"></div>
            <div class="input-group small"><label>Rate (%)</label>
            <input type="number" class="fd-rate" placeholder="e.g. 7.5" min="0.01" step="0.01" value="${rate}"></div>
            <button class="btn-remove" type="button" onclick="removeFdRow(${id})">✕</button>
        </div>`;
        if (fdRowsContainer) fdRowsContainer.appendChild(row);
    }
    
    window.removeFdRow = function(id) {
        if (fdRowsContainer && fdRowsContainer.children.length <= 1) return showError('Need at least one FD option.');
        const el = $(`fd-row-${id}`);
        if (el) el.remove();
    };

    addFdRow();
    if (addFdBtn) addFdBtn.addEventListener('click', () => addFdRow());

    function showError(msg) {
        if (errorBanner) {
            errorBanner.textContent = msg;
            safeRemoveClass(errorBanner, 'hidden');
            safeSetDisplay(errorBanner, 'block');
        }
        safeSetDisplay(greedyResultCard, 'none');
        safeSetDisplay(backtrackingResultCard, 'none');
        safeSetDisplay(bottomSection, 'none');
        safeAddClass(strategyBadge, 'hidden');
        safeSetDisplay(strategyBadge, 'none');
    }

    function clearError() { 
        if (errorBanner) {
            errorBanner.textContent = ''; 
            safeAddClass(errorBanner, 'hidden');
            safeSetDisplay(errorBanner, 'none'); 
        }
    }

    function showBadge(mode) {
        if (!strategyBadge) return;
        const { text, cls } = badgeInfo[mode];
        strategyBadge.textContent = text;
        strategyBadge.className = `strategy-badge ${cls}`;
        safeRemoveClass(strategyBadge, 'hidden');
        safeSetDisplay(strategyBadge, 'inline-flex');
    }

    function collectInputs() {
        const amt = parseFloat($('investmentAmount')?.value);
        const yrs = parseInt($('timeHorizon')?.value, 10);
        const emg = parseFloat($('emergencyFund')?.value) || 0;
        if (isNaN(amt) || amt <= 0) throw new Error('Enter a valid investment amount.');
        if (isNaN(yrs) || yrs <= 0) throw new Error('Enter a valid time horizon.');
        if (emg < 0 || emg >= amt) throw new Error('Emergency fund must be ≥ 0 and < total amount.');
        
        const fds = [];
        if (fdRowsContainer) {
            fdRowsContainer.querySelectorAll('.fd-duration').forEach((el, i) => {
                const dur = parseInt(el.value, 10);
                const rateEl = fdRowsContainer.querySelectorAll('.fd-rate')[i];
                const rate = parseFloat(rateEl ? rateEl.value : 0);
                if (isNaN(dur) || dur <= 0) throw new Error(`FD ${i + 1}: invalid duration.`);
                if (isNaN(rate) || rate <= 0 || rate >= 100) throw new Error(`FD ${i + 1}: rate must be 0–100.`);
                fds.push({ duration: dur, rate: rate / 100 });
            });
        }
        if (fds.length === 0) throw new Error('Add at least one FD option.');
        return { total_amount: amt, time_horizon: yrs, emergency_fund: emg, fds };
    }

    async function fetchMode(payload, mode) {
        const res = await fetch(`${API_URL}?mode=${mode}`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        const data = await res.json();
        console.log(`API Response (${mode}):`, data); // Debug logging
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        return data;
    }

    // Greedy viz functions
    function renderFdCards(container, fds) {
        if (!container) return {};
        container.innerHTML = '';
        const map = {};
        fds.forEach((fd) => {
            const label = `${fd.duration}Y ${(fd.rate * 100).toFixed(1)}%`;
            const el = document.createElement('div');
            el.className = 'fd-card';
            el.innerHTML = `<span class="fd-card-duration">${fd.duration}Y</span><span class="fd-card-rate">${(fd.rate * 100).toFixed(1)}%</span>`;
            container.appendChild(el);
            map[label] = el;
        });
        return map;
    }

    function appendStep(container, text, type = 'info') {
        if (!container) return;
        const el = document.createElement('div');
        el.className = `step-line step-${type}`; el.textContent = text;
        container.appendChild(el);
        requestAnimationFrame(() => el.classList.add('visible'));
    }

    async function animateSteps(logEl, steps, cardMap, investable) {
        if (!logEl) return;
        logEl.innerHTML = '';
        Object.values(cardMap).forEach(c => c.className = 'fd-card');
        appendStep(logEl, `💰 Investable: ₹${investable.toLocaleString()}`, 'info');
        await sleep(300);
        for (let i = 0; i < steps.length; i++) {
            const s = steps[i];
            if (cardMap[s.fd]) cardMap[s.fd].classList.add('fd-card--selected');
            appendStep(logEl, `Step ${i + 1}: ${s.fd} → ₹${s.allocated.toLocaleString()}`, 'selected');
            await sleep(300);
            appendStep(logEl, s.remaining > 0 ? `  Remaining: ₹${s.remaining.toLocaleString()}` : '  Fully allocated ✓', s.remaining > 0 ? 'info' : 'success');
            await sleep(300);
        }
    }

    // Tree functions
    const NODE_W = 100, NODE_H = 46, H_GAP = 6, V_GAP = 40, STEP_MS = 380;
    function buildTree(nodes, edges) {
        const childrenOf = {}, nodeById = {};
        nodes.forEach(n => { childrenOf[n.id] = []; nodeById[n.id] = n; });
        edges.forEach(e => childrenOf[e.from_id].push(e.to_id));
        return { childrenOf, nodeById };
    }
    function subtreeW(nid, ch) {
        const kids = ch[nid];
        if (!kids.length) return NODE_W;
        return Math.max(NODE_W, kids.reduce((s, c) => s + subtreeW(c, ch), 0) + H_GAP * (kids.length - 1));
    }
    function layout(nid, x, y, ch, pos) {
        pos[nid] = { x, y };
        const kids = ch[nid]; if (!kids.length) return;
        const total = kids.reduce((s, c) => s + subtreeW(c, ch), 0) + H_GAP * (kids.length - 1);
        let cx = x - total / 2;
        kids.forEach(cid => { const sw = subtreeW(cid, ch); layout(cid, cx + sw / 2, y + NODE_H + V_GAP, ch, pos); cx += sw + H_GAP; });
    }
    function dims(pos) {
        let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
        Object.values(pos).forEach(({ x, y }) => { minX = Math.min(minX, x - NODE_W / 2); maxX = Math.max(maxX, x + NODE_W / 2); maxY = Math.max(maxY, y + NODE_H); });
        return { w: maxX - minX, h: maxY, ox: -minX };
    }

    // Render Tree Structure
    async function drawTree(container, summary, nodes, edges, bestIds, bestVal) {
        if (!container) return;
        const inner = document.getElementById("treeInner");
        if (!inner) return;

        const { childrenOf, nodeById } = buildTree(nodes, edges);
        const rootId = nodes[0].id, bestSet = new Set(bestIds);
        const pos = {}; layout(rootId, 0, 0, childrenOf, pos);
        const { w, h, ox } = dims(pos);
        const PAD = 16, W = w + PAD * 2, H = h + PAD * 2;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', W); svg.setAttribute('height', H);
        svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;';
        
        inner.style.cssText = `position:relative;width:${W}px;height:${H}px;transform-origin:top center;`;
        inner.appendChild(svg);

        const bfs = []; const q = [rootId];
        while (q.length) { const nid = q.shift(); bfs.push(nid); childrenOf[nid].forEach(c => q.push(c)); }

        const state = nid => nid === rootId ? 'root' : bestSet.has(nid) ? 'best' : childrenOf[nid].length === 0 ? 'rejected' : 'explored';
        const els = {};
        bfs.forEach(nid => {
            const node = nodeById[nid], p = pos[nid];
            const el = document.createElement('div');
            el.className = 'tree-node tree-node--hidden';
            el.dataset.state = state(nid);
            el.style.cssText = `left:${p.x + ox + PAD - NODE_W / 2}px;top:${p.y + PAD}px;width:${NODE_W}px;height:${NODE_H}px;position:absolute;`;
            el.innerHTML = `<span class="tn-fd">${node.fd === 'Start' ? '🌱 Start' : '📌 ' + node.fd}</span><span class="tn-val">₹${node.value.toLocaleString()}</span>`;
            inner.appendChild(el);
            els[nid] = { el, cx: p.x + ox + PAD, cy: p.y + PAD };
        });

        // Use user's exact scaling code
        const scaleX = container.offsetWidth / inner.scrollWidth;
        const scaleY = container.offsetHeight / inner.scrollHeight;
        const scale = Math.min(scaleX, scaleY, 1);
        inner.style.transform = `scale(${scale})`;

        for (const nid of bfs) {
            if (nid !== rootId) await sleep(STEP_MS);
            const { el, cx, cy } = els[nid];
            el.classList.replace('tree-node--hidden', 'tree-node--visible');
            const node = nodeById[nid];
            if (node.parent_id != null) {
                const { cx: px, cy: py } = els[node.parent_id];
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', px); line.setAttribute('y1', py + NODE_H);
                line.setAttribute('x2', cx); line.setAttribute('y2', cy);
                line.setAttribute('class', `tree-edge ${bestSet.has(nid) && bestSet.has(node.parent_id) ? 'tree-edge--best' : 'tree-edge--grey'}`);
                svg.appendChild(line);
            }
            await sleep(55);
        }

        await sleep(260);
        bfs.forEach(nid => els[nid].el.classList.add(`tree-node--${els[nid].el.dataset.state}`));

        if (summary) {
            await sleep(420);
            const path = bestIds.map(id => nodeById[id]).filter(Boolean).slice(1).map(n => n.fd);
            summary.innerHTML = `<div class="bps-title">🏆 Best Path Found</div>
            <div class="bps-steps">${path.join(' → ') || '(no FD fits)'}</div>
            <div class="bps-value">Return: <strong>₹${bestVal.toLocaleString()}</strong></div>`;
            safeSetDisplay(summary, 'block');
            requestAnimationFrame(() => safeAddClass(summary, 'bps--visible'));
        }
    }

    // Render unified results
    let growthChartInstance = null;

    function renderGrowthChart(principal, rate, years) {
        const ctx = $('growthChart');
        if (!ctx) return;
        
        if (growthChartInstance) {
            growthChartInstance.destroy();
        }

        const labels = [];
        const data = [];
        for (let i = 0; i <= years; i++) {
            labels.push(`Year ${i}`);
            // Compound interest formula: Value = Principal * (1 + rate)^time
            const val = principal * Math.pow(1 + rate, i);
            data.push(val);
        }

        growthChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Investment Growth',
                    data: data,
                    borderColor: '#3B82F6', // Secondary blue
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    tension: 0.4, // Smooth curve
                    fill: true,
                    pointBackgroundColor: '#0B0F1A',
                    pointBorderColor: '#3B82F6',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return '₹' + context.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 0 });
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#9CA3AF' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9CA3AF' }
                    }
                }
            }
        });
    }

    function renderDecisionTree(treeData) {
        const container = document.getElementById("decisionTree");
        if (!container) return;

        container.innerHTML = '<div id="treeInner"></div>'; // Recreate inner tree wrapper to clear

        if (!treeData || !treeData.nodes || treeData.nodes.length === 0) {
            container.innerHTML = "<p style='color:var(--text-sec); padding:24px; text-align:center; width:100%;'>No tree data available</p>";
            return;
        }

        console.log("Tree Data:", treeData);
        drawTree(container, $('btBestPathSummary'), treeData.nodes, treeData.edges, treeData.best_path_ids, treeData.best_value);
    }

    async function renderResults(payload, gData, btData, mode) {
        const investable = payload.total_amount - payload.emergency_fund;
        
        safeSetDisplay(resultsSection, 'block');
        if (mode === 'compare') {
            safeSetDisplay(bottomSection, 'flex');
            safeSetDisplay($('compareExplanation'), 'block');
        } else {
            safeSetDisplay(bottomSection, 'flex');
            safeSetDisplay($('compareExplanation'), 'none');
        }
        
        // Update Breakdown
        if ($('rsTotal')) $('rsTotal').textContent = `₹${payload.total_amount.toLocaleString()}`;
        if ($('rsEmergency')) $('rsEmergency').textContent = `₹${payload.emergency_fund.toLocaleString()}`;
        if ($('rsInvested')) $('rsInvested').textContent = `₹${investable.toLocaleString()}`;

        // Populate Greedy Allocation
        if (gData && gData.steps && gData.steps.length > 0) {
            const step = gData.steps[0];
            if ($('greedyAllocation')) {
                $('greedyAllocation').innerHTML = `
                    <div class="allocation-item">
                        <span class="alloc-fd">📌 ${step.fd}</span>
                        <span class="alloc-amt">₹${step.allocated.toLocaleString()}</span>
                    </div>
                `;
            }
            
            // Render chart only for greedy mode
            if (mode === 'greedy') {
                safeSetDisplay($('greedyChartContainer'), 'block');
                const rateMatch = step.fd.match(/(\d+(\.\d+)?)%/);
                const rate = rateMatch ? parseFloat(rateMatch[1]) / 100 : 0;
                renderGrowthChart(step.allocated, rate, payload.time_horizon);
            } else {
                safeSetDisplay($('greedyChartContainer'), 'none');
            }
        } else {
            if ($('greedyAllocation')) {
                $('greedyAllocation').innerHTML = '<div class="allocation-item"><span class="alloc-fd">No eligible FD</span><span class="alloc-amt">-</span></div>';
            }
            safeSetDisplay($('greedyChartContainer'), 'none');
        }

        // Populate BT Allocation
        if (btData && btData.best_path_ids) {
            const path = btData.best_path_ids.map(id => {
                const node = btData.nodes.find(n => n.id === id);
                return node ? node.fd : null;
            }).filter(fd => fd && fd !== 'Start');
            
            if (path.length > 0 && $('btAllocation')) {
                $('btAllocation').innerHTML = `
                    <div class="allocation-item">
                        <span class="alloc-fd">📌 ${path[path.length - 1]}</span>
                        <span class="alloc-amt">₹${investable.toLocaleString()}</span>
                    </div>
                `;
            } else if ($('btAllocation')) {
                $('btAllocation').innerHTML = '<div class="allocation-item"><span class="alloc-fd">No eligible FD</span><span class="alloc-amt">-</span></div>';
            }
        }
        
        // Reset panels
        safeRemoveClass(greedyResultCard, 'panel-best');
        safeRemoveClass(greedyResultCard, 'panel-worse');
        safeRemoveClass(backtrackingResultCard, 'panel-best');
        safeRemoveClass(backtrackingResultCard, 'panel-worse');
        
        safeAddClass(greedyWinnerBadge, 'hidden');
        safeAddClass(btWinnerBadge, 'hidden');

        if (mode === 'greedy') {
            safeSetDisplay(greedyResultCard, 'flex');
            safeSetDisplay(backtrackingResultCard, 'none');
            safeSetDisplay(greedyBottomCard, 'flex');
            safeSetDisplay(btBottomCard, 'none');
            
            if (greedyReturnDisplay) {
                greedyReturnDisplay.textContent = `₹${gData.total_return.toLocaleString()}`;
                greedyReturnDisplay.style.background = 'var(--success)';
                greedyReturnDisplay.style.webkitBackgroundClip = 'text';
                greedyReturnDisplay.style.webkitTextFillColor = 'transparent';
            }
            safeAddClass(greedyResultCard, 'panel-best'); // Show as green since it's the only one
            await animateSteps(greedyStepLog, gData.steps, renderFdCards(greedyFdCards, payload.fds), investable);
            
        } else if (mode === 'backtracking') {
            safeSetDisplay(greedyResultCard, 'none');
            safeSetDisplay(backtrackingResultCard, 'flex');
            safeSetDisplay(greedyBottomCard, 'none');
            safeSetDisplay(btBottomCard, 'flex');
            
            if (btReturnDisplay) {
                btReturnDisplay.textContent = `₹${btData.best_value.toLocaleString()}`;
                btReturnDisplay.style.background = 'var(--success)';
                btReturnDisplay.style.webkitBackgroundClip = 'text';
                btReturnDisplay.style.webkitTextFillColor = 'transparent';
            }
            safeAddClass(backtrackingResultCard, 'panel-best');
            
            setTimeout(() => {
                renderDecisionTree(btData);
            }, 100);
            
        } else if (mode === 'compare') {
            console.log("Tree Data:", btData);
            safeSetDisplay(greedyResultCard, 'flex');
            safeSetDisplay(backtrackingResultCard, 'flex');
            safeSetDisplay(greedyBottomCard, 'flex');
            safeSetDisplay(btBottomCard, 'flex');
            
            const gReturn = gData.total_return;
            const btReturn = btData.best_value;
            
            if (greedyReturnDisplay) {
                greedyReturnDisplay.textContent = `₹${gReturn.toLocaleString()}`;
                greedyReturnDisplay.style.background = '';
                greedyReturnDisplay.style.webkitBackgroundClip = '';
                greedyReturnDisplay.style.webkitTextFillColor = '';
            }
            if (btReturnDisplay) {
                btReturnDisplay.textContent = `₹${btReturn.toLocaleString()}`;
                btReturnDisplay.style.background = '';
                btReturnDisplay.style.webkitBackgroundClip = '';
                btReturnDisplay.style.webkitTextFillColor = '';
            }
            
            if (gReturn > btReturn) {
                safeAddClass(greedyResultCard, 'panel-best');
                safeAddClass(greedyWinnerBadge, 'winner-badge');
                safeRemoveClass(greedyWinnerBadge, 'hidden');
                
                safeAddClass(backtrackingResultCard, 'panel-worse');
            } else if (btReturn > gReturn) {
                safeAddClass(backtrackingResultCard, 'panel-best');
                safeAddClass(btWinnerBadge, 'winner-badge');
                safeRemoveClass(btWinnerBadge, 'hidden');
                
                safeAddClass(greedyResultCard, 'panel-worse');
            } else {
                safeAddClass(greedyResultCard, 'panel-best');
                safeAddClass(backtrackingResultCard, 'panel-best');
            }
            
            animateSteps(greedyStepLog, gData.steps, renderFdCards(greedyFdCards, payload.fds), investable);
            
            setTimeout(() => {
                renderDecisionTree(btData);
            }, 100);
        }
    }

    if (calculateBtn) {
        calculateBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            clearError();
            safeSetDisplay(resultsSection, 'none');
            safeSetDisplay(bottomSection, 'none');
            safeAddClass(strategyBadge, 'hidden');

            let payload;
            try { payload = collectInputs(); } catch (err) { showError(err.message); return; }

            showBadge(currentMode);
            
            try {
                let gData = null, btData = null;
                
                if (currentMode === 'greedy' || currentMode === 'compare') {
                    gData = await fetchMode(payload, 'greedy');
                }
                if (currentMode === 'backtracking' || currentMode === 'compare') {
                    btData = await fetchMode(payload, 'backtracking');
                }
                
                await renderResults(payload, gData, btData, currentMode);
            } catch (err) {
                showError(`Backend error: ${err.message}`);
            }
        });
    }

    // Summary cards live update
    function updateSummaryCards() {
        const amt = parseFloat($('investmentAmount')?.value) || 0;
        const emg = parseFloat($('emergencyFund')?.value) || 0;
        const invested = Math.max(0, amt - emg);
        
        if ($('topTotalInv')) $('topTotalInv').textContent = `₹${amt.toLocaleString()}`;
        if ($('topEmgFund')) $('topEmgFund').textContent = `₹${emg.toLocaleString()}`;
        if ($('topInvested')) $('topInvested').textContent = `₹${invested.toLocaleString()}`;
    }

    ['investmentAmount', 'emergencyFund'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', updateSummaryCards);
    });

});
