const API_URL = 'http://localhost:5000/optimize';

// DOM refs
const $ = id => document.getElementById(id);
const calculateBtn = $('calculateBtn'), calcBtnLabel = $('calcBtnLabel');
const addFdBtn = $('addFdBtn'), fdRowsContainer = $('fdRows');
const errorBanner = $('errorBanner'), strategyBadge = $('strategyBadge');
const resultArea = $('resultArea'), compareArea = $('compareArea');
const investedEl = $('investedAmountDisplay'), emergencyEl = $('emergencyReservedDisplay'), returnEl = $('totalReturnDisplay');
const fdCards = $('fdCards'), stepLog = $('stepLog');
const fdCardsSection = $('fdCardsSection'), stepLogSection = $('stepLogSection'), treeSection = $('treeSection');
const treeCanvas = $('treeCanvas'), bestPathSummary = $('bestPathSummary');
const cmpInvested = $('cmpInvested'), cmpEmergency = $('cmpEmergency');
const cmpGreedyReturn = $('cmpGreedyReturn'), cmpBtReturn = $('cmpBtReturn');
const cmpFdCards = $('cmpFdCards'), cmpStepLog = $('cmpStepLog');
const cmpTreeCanvas = $('cmpTreeCanvas'), cmpBestPathSummary = $('cmpBestPathSummary');
const cmpGreedyWinner = $('cmpGreedyWinner'), cmpBtWinner = $('cmpBtWinner');

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
    $('modeHint').textContent = hints[currentMode];
    calcBtnLabel.textContent = btnLabels[currentMode];
  });
});

// Utilities
const sleep = ms => new Promise(r => setTimeout(r, ms));

// FD rows
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
  fdRowsContainer.appendChild(row);
}
function removeFdRow(id) {
  if (fdRowsContainer.children.length <= 1) return showError('Need at least one FD option.');
  $(`fd-row-${id}`)?.remove();
}
addFdRow(); // Add an empty row initially
addFdBtn.addEventListener('click', () => addFdRow());

// UI helpers
function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.style.display = 'block';
  resultArea.style.display = compareArea.style.display = strategyBadge.style.display = 'none';
}
function clearError() { errorBanner.textContent = ''; errorBanner.style.display = 'none'; }
function showBadge(mode) {
  const { text, cls } = badgeInfo[mode];
  strategyBadge.textContent = text;
  strategyBadge.className = `strategy-badge ${cls}`;
  strategyBadge.style.display = 'inline-flex';
}

// Input collection
function collectInputs() {
  const amt = parseFloat($('investmentAmount').value);
  const yrs = parseInt($('timeHorizon').value, 10);
  const emg = parseFloat($('emergencyFund').value) || 0;
  if (isNaN(amt) || amt <= 0) throw new Error('Enter a valid investment amount.');
  if (isNaN(yrs) || yrs <= 0) throw new Error('Enter a valid time horizon.');
  if (emg < 0 || emg >= amt) throw new Error('Emergency fund must be ≥ 0 and < total amount.');
  const fds = [];
  fdRowsContainer.querySelectorAll('.fd-duration').forEach((el, i) => {
    const dur = parseInt(el.value, 10);
    const rate = parseFloat(fdRowsContainer.querySelectorAll('.fd-rate')[i].value);
    if (isNaN(dur) || dur <= 0) throw new Error(`FD ${i + 1}: invalid duration.`);
    if (isNaN(rate) || rate <= 0 || rate >= 100) throw new Error(`FD ${i + 1}: rate must be 0–100.`);
    fds.push({ duration: dur, rate: rate / 100 });
  });
  if (fds.length === 0) throw new Error('Add at least one FD option.');
  return { total_amount: amt, time_horizon: yrs, emergency_fund: emg, fds };
}

// API
async function fetchMode(payload, mode) {
  const res = await fetch(`${API_URL}?mode=${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

// Greedy viz
function renderFdCards(container, fds) {
  container.innerHTML = '';
  const map = {};
  fds.forEach((fd, i) => {
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
  const el = document.createElement('div');
  el.className = `step-line step-${type}`; el.textContent = text;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
}
async function animateSteps(logEl, steps, cardMap, investable) {
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

// Decision tree
const NODE_W = 126, NODE_H = 60, H_GAP = 14, V_GAP = 58, STEP_MS = 380;

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

async function animateTree(canvas, summary, nodes, edges, bestIds, bestVal) {
  canvas.innerHTML = '';
  if (summary) { summary.style.display = 'none'; summary.classList.remove('bps--visible'); }
  if (!nodes?.length) { canvas.innerHTML = '<p style="padding:1rem;color:#94a3b8">No tree data.</p>'; return; }

  const { childrenOf, nodeById } = buildTree(nodes, edges);
  const rootId = nodes[0].id, bestSet = new Set(bestIds);
  const pos = {}; layout(rootId, 0, 0, childrenOf, pos);
  const { w, h, ox } = dims(pos);
  const PAD = 16, W = w + PAD * 2, H = h + PAD * 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;';
  canvas.style.cssText = `position:relative;width:${W}px;height:${H}px;`;
  canvas.appendChild(svg);

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
    canvas.appendChild(el);
    els[nid] = { el, cx: p.x + ox + PAD, cy: p.y + PAD };
  });

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
    summary.style.display = 'block';
    requestAnimationFrame(() => summary.classList.add('bps--visible'));
  }
}

// Main handler
calculateBtn.addEventListener('click', async () => {
  clearError();
  resultArea.style.display = compareArea.style.display = 'none';
  strategyBadge.style.display = 'none';

  let payload;
  try { payload = collectInputs(); } catch (e) { showError(e.message); return; }

  const investable = payload.total_amount - payload.emergency_fund;

  if (currentMode === 'compare') {
    showBadge('compare');
    try {
      const [gData, btData] = await Promise.all([fetchMode(payload, 'greedy'), fetchMode(payload, 'backtracking')]);
      compareArea.style.display = 'block';
      cmpInvested.textContent = `₹${investable.toLocaleString()}`;
      cmpEmergency.textContent = `₹${payload.emergency_fund.toLocaleString()}`;
      cmpGreedyReturn.textContent = `₹${gData.total_return.toLocaleString()}`;
      cmpBtReturn.textContent = `₹${btData.best_value.toLocaleString()}`;
      cmpGreedyWinner.style.display = gData.total_return >= btData.best_value ? 'inline-flex' : 'none';
      cmpBtWinner.style.display = btData.best_value > gData.total_return ? 'inline-flex' : 'none';
      animateSteps(cmpStepLog, gData.steps, renderFdCards(cmpFdCards, payload.fds), investable);
      animateTree(cmpTreeCanvas, cmpBestPathSummary, btData.nodes, btData.edges, btData.best_path_ids, btData.best_value);
    } catch (e) { showError(e.message); }
    return;
  }

  showBadge(currentMode);
  try {
    const data = await fetchMode(payload, currentMode);
    resultArea.style.display = 'block';
    investedEl.textContent = `₹${investable.toLocaleString()}`;
    emergencyEl.textContent = `₹${payload.emergency_fund.toLocaleString()}`;

    if (currentMode === 'backtracking') {
      fdCardsSection.style.display = stepLogSection.style.display = 'none';
      treeSection.style.display = 'block';
      returnEl.textContent = `₹${data.best_value.toLocaleString()}`;
      await animateTree(treeCanvas, bestPathSummary, data.nodes, data.edges, data.best_path_ids, data.best_value);
    } else {
      fdCardsSection.style.display = stepLogSection.style.display = 'block';
      treeSection.style.display = 'none';
      returnEl.textContent = `₹${data.total_return.toLocaleString()}`;
      await animateSteps(stepLog, data.steps, renderFdCards(fdCards, payload.fds), investable);
    }
  } catch (e) { showError(`Backend error: ${e.message}`); }
});
