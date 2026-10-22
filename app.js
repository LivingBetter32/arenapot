/* ============================================================
   ArenaPot - app.js
   All data is stored in the browser using localStorage.
   Think of localStorage as a tiny database that survives
   page refreshes. Data is stored as JSON strings.

   Domain model:
     players     — a person who can enter tournaments
                   { id, name, tag }
     tournaments — a contest with a fixed buy-in (XLM)
                   { id, number (permanent), title, buyIn, createdAt }
     entries     — one player entering one tournament
                   { id, number (permanent), tournamentId, playerId,
                     buyIn, paid, createdAt }
   ============================================================ */

// ---------- DATA LAYER ----------
// Load saved data from localStorage, or start empty if none exists.
// JSON.parse turns the stored text back into real arrays/objects.
let players = JSON.parse(localStorage.getItem('players')) || [];
let tournaments = JSON.parse(localStorage.getItem('tournaments')) || [];
let entries = JSON.parse(localStorage.getItem('entries')) || [];
let nextTournamentNumber = parseInt(localStorage.getItem('nextTournamentNumber')) || 1;
let nextEntryNumber = parseInt(localStorage.getItem('nextEntryNumber')) || 1;

// Save current data back into localStorage as JSON text.
function saveData() {
  localStorage.setItem('players', JSON.stringify(players));
  localStorage.setItem('tournaments', JSON.stringify(tournaments));
  localStorage.setItem('entries', JSON.stringify(entries));
  localStorage.setItem('nextTournamentNumber', nextTournamentNumber);
  localStorage.setItem('nextEntryNumber', nextEntryNumber);
}

// ---------- HELPERS ----------
// Format an XLM amount, trimming trailing zeros: 36 -> "36", 10.5 -> "10.5"
function xlm(amount) {
  return Number(amount).toLocaleString('en-US', { maximumFractionDigits: 7 });
}

// Today's date as 'YYYY-MM-DD'
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Work out the status of an entry based on its payment.
function getEntryStatus(entry) {
  if (entry.paid) return 'paid';
  // Payment activity exists but no terminal outcome yet (submitted/pending/verifying).
  const rec = getPaymentRecord(entry.number);
  if (rec && !['verified', 'failed', 'expired'].includes(rec.status)) return 'paying';
  return 'pending';
}

function findTournament(id) {
  return tournaments.find(t => t.id === id);
}

function findPlayer(id) {
  return players.find(p => p.id === id);
}

function findEntryByNumber(number) {
  return entries.find(e => e.number === Number(number));
}

// Entries for a tournament, newest first.
function tournamentEntries(tournamentId) {
  return entries.filter(e => e.tournamentId === tournamentId).reverse();
}

// Pot so far = sum of PAID buy-ins × 90% (the vault share).
function tournamentPot(tournamentId) {
  return entries
    .filter(e => e.tournamentId === tournamentId && e.paid)
    .reduce((sum, e) => sum + e.buyIn * 0.9, 0);
}

// ---------- INLINE SVG ICONS (offline, no external assets) ----------
const ICON = {
  trophy: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0V3z" fill="#f0b429"/><path d="M7 4H4.5a2.8 2.8 0 0 0 2.9 3.6M17 4h2.5a2.8 2.8 0 0 1-2.9 3.6" stroke="#f0b429" stroke-width="1.5" fill="none"/><rect x="11" y="12" width="2" height="3" fill="#f0b429"/><rect x="8" y="15.6" width="8" height="2.2" rx="1" fill="#f0b429"/><rect x="6.6" y="18.4" width="10.8" height="2.2" rx="1" fill="#b8860b"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#f0b429"/><circle cx="12" cy="12" r="5.4" fill="none" stroke="#14181d" stroke-width="1.5"/></svg>`,
  ticket: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 9a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v1.5a2.5 2.5 0 0 0 0 3V15a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-1.5a2.5 2.5 0 0 0 0-3V9z" stroke="#6b7683" stroke-width="1.5" fill="#181d23"/><path d="M14 7v2m0 6v2m0-6v2" stroke="#6b7683" stroke-width="1.5" stroke-dasharray="1.5 2"/></svg>`,
  /* sharp-angled rank badges (hexagonal, not round) for the podium */
  medalGold: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true"><path d="M12 1.5l8.5 5v9L12 22.5 3.5 15.5v-9z" fill="#f0b429" stroke="#ffd766" stroke-width="1.2"/><path d="M12 5.4l5.2 3v5.2l-5.2 3-5.2-3V8.4z" fill="#14181d" opacity=".5"/><text x="12" y="14.6" text-anchor="middle" font-family="monospace" font-size="8.5" font-weight="800" fill="#14181d">1</text></svg>`,
  medalSilver: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true"><path d="M12 1.5l8.5 5v9L12 22.5 3.5 15.5v-9z" fill="#c0c9d2" stroke="#eef2f6" stroke-width="1.2"/><path d="M12 5.4l5.2 3v5.2l-5.2 3-5.2-3V8.4z" fill="#14181d" opacity=".45"/><text x="12" y="14.6" text-anchor="middle" font-family="monospace" font-size="8.5" font-weight="800" fill="#14181d">2</text></svg>`,
  medalBronze: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true"><path d="M12 1.5l8.5 5v9L12 22.5 3.5 15.5v-9z" fill="#cd7f32" stroke="#e0955a" stroke-width="1.2"/><path d="M12 5.4l5.2 3v5.2l-5.2 3-5.2-3V8.4z" fill="#14181d" opacity=".45"/><text x="12" y="14.6" text-anchor="middle" font-family="monospace" font-size="8.5" font-weight="800" fill="#14181d">3</text></svg>`
};

// ---------- PLAYERS ----------
const playerForm = document.getElementById('player-form');

playerForm.addEventListener('submit', e => {
  e.preventDefault(); // stop the page from reloading on submit

  const player = {
    id: Date.now(), // simple unique id: current timestamp
    name: document.getElementById('player-name').value.trim(),
    tag: document.getElementById('player-tag').value.trim()
  };

  if (!player.name) return; // name is required

  players.push(player);
  saveData();
  playerForm.reset(); // clear the form
  renderAll();
});

function deletePlayer(id) {
  // Stop if this player still has entries (would leave orphan data).
  const hasEntries = entries.some(en => en.playerId === id);
  if (hasEntries) {
    alert('This player has tournament entries. Delete their entries first.');
    return;
  }
  if (!confirm('Delete this player?')) return;
  players = players.filter(p => p.id !== id);
  saveData();
  renderAll();
}

function renderPlayers() {
  const tbody = document.querySelector('#players-table tbody');
  tbody.innerHTML = '';

  if (players.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">No players yet — add your first one above.</td></tr>';
  }

  players.forEach(p => {
    const count = entries.filter(e => e.playerId === p.id).length;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${p.name}</td>
      <td>${p.tag ? `<span class="mono">@${p.tag}</span>` : '—'}</td>
      <td>${count}</td>
      <td><button class="btn-delete" onclick="deletePlayer(${p.id})">Delete</button></td>
    `;
    tbody.appendChild(row);
  });
}

// ---------- TOURNAMENTS ----------
const tournamentForm = document.getElementById('tournament-form');

tournamentForm.addEventListener('submit', e => {
  e.preventDefault();

  const title = document.getElementById('tournament-title').value.trim();
  const buyIn = parseFloat(document.getElementById('tournament-buyin').value);
  if (!title || !(buyIn > 0)) return;

  const tournament = {
    id: Date.now(),
    number: nextTournamentNumber++, // permanent — never reused, even after deletes
    title,
    buyIn,
    createdAt: todayStr()
  };

  tournaments.push(tournament);
  saveData();
  tournamentForm.reset();
  renderAll();
});

function deleteTournament(id) {
  const hasEntries = entries.some(en => en.tournamentId === id);
  if (hasEntries) {
    alert('This tournament has entries. Delete its entries first (or keep it for the records).');
    return;
  }
  if (!confirm('Delete this tournament?')) return;
  tournaments = tournaments.filter(t => t.id !== id);
  saveData();
  renderAll();
}

// Render tournaments as arena cards (grid), each with a live pot progress bar.
function renderTournaments() {
  const grid = document.getElementById('tournaments-grid');

  if (tournaments.length === 0) {
    grid.innerHTML = '<div class="empty-msg tournaments-empty">No tournaments yet — create your first bracket above.</div>';
    return;
  }

  // Show newest first.
  grid.innerHTML = [...tournaments].reverse().map(t => {
    const list = entries.filter(e => e.tournamentId === t.id);
    const paidCount = list.filter(e => e.paid).length;
    const pot = tournamentPot(t.id);
    // Pot progress: position inside the current 25 XLM milestone bucket.
    const pct = pot <= 0 ? 0 : Math.min(100, Math.round(((pot % 25) / 25) * 100));
    const paying = list.some(e => getEntryStatus(e) === 'paying');
    const statusClass = paying ? 'paying' : 'pending';
    const statusLabel = paying ? 'Paying' : 'Open';
    return `
    <div class="t-card">
      <div class="t-card-top">
        <span class="t-card-num">Bracket #${t.number}</span>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>
      <h3 class="t-card-title">${t.title}</h3>
      <div class="t-card-buyin">${ICON.coin}<span class="t-card-buyin-value">${xlm(t.buyIn)}</span><span class="t-card-buyin-cur">XLM buy-in</span></div>
      <div class="t-card-potbar"><div class="t-card-potfill" style="width:${pct}%"></div></div>
      <div class="t-card-potline">${ICON.trophy}<span><b>${xlm(pot)} XLM</b> pot · ${paidCount}/${list.length} paid</span></div>
      <div class="t-card-actions">
        <button class="btn-pay-xlm" onclick="openEnterModal(${t.id})">Enter</button>
        <button class="btn-view" onclick="viewTournament(${t.id})">View</button>
        <button class="btn-delete" onclick="deleteTournament(${t.id})">Delete</button>
      </div>
    </div>`;
  }).join('');
}

// ---------- PODIUM (biggest pots, from real data) ----------
function renderPodium() {
  const body = document.getElementById('podium-body');
  if (!body) return;

  const ranked = tournaments
    .map(t => ({ t, pot: tournamentPot(t.id) }))
    .filter(x => x.pot > 0)
    .sort((a, b) => b.pot - a.pot)
    .slice(0, 3);

  if (ranked.length === 0) {
    body.innerHTML = `<div class="podium-empty">No pots yet — the first paid entry claims the podium.</div>`;
    return;
  }

  const medal = [ICON.medalGold, ICON.medalSilver, ICON.medalBronze];
  // Visual order on the podium: 2nd, 1st, 3rd.
  const order = [1, 0, 2].filter(i => i < ranked.length);
  body.innerHTML = `<div class="podium-cols">` + order.map(i => `
    <div class="podium-col place-${i + 1}">
      <div class="podium-medal">${medal[i]}</div>
      <div class="podium-title">${ranked[i].t.title}</div>
      <div class="podium-amount">${xlm(ranked[i].pot)} XLM</div>
      <div class="podium-base"><span>#${ranked[i].t.number}</span></div>
    </div>`).join('') + `</div>`;
}

// ---------- ENTRIES ----------
// "Enter" is the app's core action: pick a player, create the entry record,
// then walk straight into the XLM payment flow for that entry.
function openEnterModal(tournamentId) {
  const t = findTournament(tournamentId);
  if (!t) return;

  if (players.length === 0) {
    alert('Add a player first (Players section below), then enter them into a tournament.');
    return;
  }

  payModal.hidden = false;
  if (payTimer) { clearInterval(payTimer); payTimer = null; }
  payModalBody.innerHTML = `
    <div class="lobby">
      <div class="lobby-head">
        <span class="lobby-eyebrow">Match lobby</span>
        <h4 class="lobby-title">${t.title}</h4>
        <span class="lobby-sub">Bracket #${t.number} · pick who is entering</span>
      </div>
      <div class="lobby-buyin">${ICON.coin}<span class="lobby-buyin-value">${xlm(t.buyIn)}</span><span class="lobby-buyin-cur">XLM buy-in</span></div>
      <label class="lobby-player-label">Player entering
        <select id="enter-player" class="lobby-select">
          ${players.map(p => `<option value="${p.id}">${p.name}${p.tag ? ` (@${p.tag})` : ''}</option>`).join('')}
        </select>
      </label>
      <div class="lobby-split-row vault">${ICON.trophy}<span>Arena vault (90%)</span><b>${xlm(t.buyIn * 0.9)} XLM</b></div>
      <div class="lobby-split-row community"><span>Community fund (10%)</span><b>${xlm(t.buyIn * 0.1)} XLM</b></div>
    </div>
    <p class="pay-note">This creates the entry record, then opens the payment review. The entry is only marked <b>paid</b> after both payouts are verified on-chain.</p>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closePayModal()">Cancel</button>
      <button class="btn-sign" id="btn-enter-continue">Create entry &amp; pay</button>
    </div>
    <div id="pay-status-slot"></div>`;

  document.getElementById('btn-enter-continue').addEventListener('click', () => {
    const playerId = parseInt(document.getElementById('enter-player').value);
    const player = findPlayer(playerId);
    if (!player) return;

    const entry = {
      id: Date.now(),
      number: nextEntryNumber++, // permanent — never reused
      tournamentId: t.id,
      playerId: player.id,
      buyIn: t.buyIn,
      paid: false,
      createdAt: todayStr()
    };
    entries.push(entry);
    saveData();
    renderAll();
    openPayModal(entry.number);
  });
}

function deleteEntry(number) {
  if (!confirm('Delete this entry?')) return;
  entries = entries.filter(e => e.number !== Number(number));
  saveData();
  renderAll();
}

function markPaid(number) {
  const entry = findEntryByNumber(number);
  if (entry) {
    const wasPaid = entry.paid;
    entry.paid = true;
    saveData();
    renderAll();
    if (!wasPaid) burstConfetti(); // the pot just grew — victory lap
  }
}

// Gold confetti burst when an entry flips to paid: ~14 fixed-position
// gold rectangles that fall and spin, cleaned up after the animation.
// Purely decorative and fully defensive — never blocks the payment flow.
function burstConfetti() {
  try {
    if (document.querySelector('.ap-confetti')) return; // one burst at a time
    const colors = ['#ffd766', '#f0b429', '#d19a17', '#10b981'];
    for (let i = 0; i < 14; i++) {
      const bit = document.createElement('div');
      bit.className = 'ap-confetti';
      const size = 6 + Math.random() * 8;
      bit.style.left = `${Math.random() * 100}vw`;
      bit.style.width = `${size.toFixed(1)}px`;
      bit.style.height = `${(size * 0.45).toFixed(1)}px`;
      bit.style.background = colors[i % colors.length];
      bit.style.setProperty('--ap-drift', `${(Math.random() * 120 - 60).toFixed(0)}px`);
      bit.style.animationDelay = `${(Math.random() * 0.35).toFixed(2)}s`;
      bit.style.animationDuration = `${(2 + Math.random() * 0.8).toFixed(2)}s`;
      document.body.appendChild(bit);
      setTimeout(() => bit.remove(), 2600);
    }
  } catch { /* confetti is optional — ignore everything */ }
}

// ---------- TOURNAMENT DETAIL VIEW ----------
const viewModal = document.getElementById('view-modal');
const viewModalBody = document.getElementById('view-modal-body');

function closeViewModal() {
  viewModal.hidden = true;
}
document.getElementById('view-modal-close').addEventListener('click', closeViewModal);
viewModal.addEventListener('click', e => { if (e.target === viewModal) closeViewModal(); });

function viewTournament(id) {
  const t = findTournament(id);
  if (!t) return;
  const list = tournamentEntries(id);
  const pot = tournamentPot(id);

  document.getElementById('view-modal-title').textContent = `Bracket #${t.number} — ${t.title}`;
  viewModalBody.innerHTML = `
    <div class="pay-review">
      <div class="row"><span>Title</span><span>${t.title}</span></div>
      <div class="row"><span>Buy-in</span><span>${xlm(t.buyIn)} XLM</span></div>
      <div class="row"><span>Created</span><span>${t.createdAt}</span></div>
      <div class="row total"><span>Prize pot so far (90% of paid buy-ins)</span><span>${xlm(pot)} XLM</span></div>
    </div>
    <table class="detail-table">
      <thead><tr><th>Entry</th><th>Player</th><th>Buy-in</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.length === 0
          ? '<tr><td colspan="5" class="empty-msg">No entries yet — press Enter on this tournament to add one.</td></tr>'
          : list.map(e => {
              const player = findPlayer(e.playerId);
              const status = getEntryStatus(e);
              return `
              <tr>
                <td>#${e.number}</td>
                <td>${player ? player.name : '(deleted player)'}</td>
                <td>${xlm(e.buyIn)} XLM</td>
                <td><span class="badge ${status}">${status}</span></td>
                <td>
                  ${!e.paid ? `<button class="btn-pay-xlm" onclick="closeViewModal(); openPayModal(${e.number})">Pay with XLM</button>` : ''}
                  ${!e.paid && getPaymentRecord(e.number) ? `<button class="btn-check-pay" onclick="closeViewModal(); checkPayment(${e.number}, true)">Check payment</button>` : ''}
                  ${!e.paid ? `<button class="btn-pay" onclick="markPaid(${e.number})">Mark paid</button>` : ''}
                  <button class="btn-delete" onclick="deleteEntry(${e.number})">Delete</button>
                </td>
              </tr>`;
            }).join('')}
      </tbody>
    </table>
    <p class="pay-note">Every paid buy-in sends ${xlm(t.buyIn)} XLM through the split: <b>${xlm(t.buyIn * 0.9)} XLM to the Arena vault</b> (the prize pot) and <b>${xlm(t.buyIn * 0.1)} XLM to the community fund</b>.</p>
    <div class="modal-actions"><button class="btn-cancel" onclick="closeViewModal()">Close</button></div>`;
  viewModal.hidden = false;
}

// ---------- DASHBOARD ----------
function renderDashboard() {
  // Prize pool = 90% of all paid buy-ins (the vault share).
  let pot = 0, pending = 0;

  entries.forEach(e => {
    if (e.paid) pot += e.buyIn * 0.9;
    else pending += 1;
  });

  document.getElementById('stat-earned').textContent = `${xlm(pot)} XLM`;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-overdue').textContent = tournaments.length;
}

// ---------- MASTER RENDER ----------
// Re-render every screen from the saved data.
// We call this after any change so the UI always matches the data.
function renderAll() {
  renderPlayers();
  renderTournaments();
  renderPodium();
  renderDashboard();
}

renderAll(); // initial paint on page load

// Auto-resolve payments left pending in a previous session: if the original
// transaction now verifies on-chain, markPaid fires automatically — the
// entry flips to "paid" with no manual "Check payment" click.
(async function autoResolvePendingPayments() {
  const pending = entries.filter(en => {
    if (en.paid) return false;
    const rec = getPaymentRecord(en.number);
    return rec && !['verified', 'failed', 'expired'].includes(rec.status);
  });
  for (const en of pending) {
    try { await checkPayment(en.number, false); } catch { /* record kept; retried next load */ }
  }
})();

/* ============================================================
   XLM PAYMENT MODULE (Paiflow guide steps 09–11)

   Flow per entry:
     1. Connect Freighter and read the player's public address.
     2. Show an explicit review: TESTNET, buy-in, 90/10 recipients, fee.
     3. Server prepares the transaction (SDK stays server-side).
     4. Freighter signs the ORIGINAL XDR with the testnet passphrase.
     5. Browser sends the signed envelope to the server's submit route,
        which verifies the body hash before submission.
     6. Server verifies the receipt + payout events; only then is the
        entry marked paid. The saved hash powers recovery ("Check payment").
   ============================================================ */

// ---------- Payment records (survive reloads so recovery never loses state) ----------
// Keyed by the PERMANENT entry number, so records survive entry-list edits
// and mean the same thing in the UI, the order store and on-chain.
function getPaymentRecords() {
  return JSON.parse(localStorage.getItem('xlmPayments')) || {};
}
function getPaymentRecord(entryNumber) {
  return getPaymentRecords()[String(entryNumber)] || null;
}
function savePaymentRecord(entryNumber, patch) {
  const all = getPaymentRecords();
  all[String(entryNumber)] = { ...(all[String(entryNumber)] || {}), ...patch };
  localStorage.setItem('xlmPayments', JSON.stringify(all));
}
function clearPaymentRecord(entryNumber) {
  const all = getPaymentRecords();
  delete all[String(entryNumber)];
  localStorage.setItem('xlmPayments', JSON.stringify(all));
}

// ---------- Modal scaffolding ----------
const payModal = document.getElementById('pay-modal');
const payModalBody = document.getElementById('pay-modal-body');
let payTimer = null; // polling timer, cleared when the modal closes

function closePayModal() {
  payModal.hidden = true;
  if (payTimer) { clearInterval(payTimer); payTimer = null; }
}
document.getElementById('pay-modal-close').addEventListener('click', closePayModal);
payModal.addEventListener('click', e => { if (e.target === payModal) closePayModal(); });

function shortAddr(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';
}

// ---------- Server API helpers (the API token never reaches the browser) ----------
async function apiPost(path, body) {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.error?.message || `Request failed (${resp.status})`);
    err.code = data?.error?.code;
    err.status = resp.status;
    throw err;
  }
  return data;
}

// ---------- Step 1: open the modal and connect Freighter ----------
async function openPayModal(entryNumber) {
  const entry = findEntryByNumber(entryNumber);
  if (!entry) return;
  const tournament = findTournament(entry.tournamentId);
  const player = findPlayer(entry.playerId);

  payModal.hidden = false;
  payModalBody.innerHTML = `<div class="pay-status pending">Connecting to Freighter…</div>`;

  if (!window.freighterConnect || !window.freighterConnect.isAvailable()) {
    payModalBody.innerHTML = `<div class="pay-status error">Freighter bridge not loaded. Check vendor/freighter-api.min.js, then reload.</div>`;
    return;
  }

  let customerAddress;
  try {
    const api = window.freighterApi;
    const connected = api && typeof api.isConnected === 'function'
      ? await api.isConnected()
      : true; // legacy bridges have no isConnected; getAddress will prompt
    if (!connected) throw new Error('Freighter is not connected');
    // Connector unwraps v6 {address}, legacy {publicKey}, or plain string.
    customerAddress = await window.freighterConnect.getAddress();
  } catch (err) {
    payModalBody.innerHTML = `
      <div class="pay-status error">Could not reach Freighter: ${err.message}</div>
      <p class="pay-note">Unlock Freighter, approve this app's origin (http://localhost:3002), and make sure Freighter is set to Stellar Testnet.</p>
      <div class="modal-actions"><button class="btn-cancel" onclick="closePayModal()">Close</button></div>`;
    return;
  }

  showReview(entry, tournament, player, customerAddress);
}

// ---------- Step 2: match-lobby payment review ----------
async function showReview(entry, tournament, player, customerAddress) {
  const amountXlm = entry.buyIn.toFixed(2);
  let config;
  try {
    config = await (await fetch('/api/config')).json();
  } catch {
    payModalBody.innerHTML = `<div class="pay-status error">Payment server unreachable. Start it with <b>npm start</b> and reload.</div>`;
    return;
  }

  payModalBody.innerHTML = `
    <div class="lobby">
      <div class="lobby-head">
        <span class="lobby-eyebrow">Match lobby · Entry #${entry.number}</span>
        <h4 class="lobby-title">${tournament ? tournament.title : '(tournament)'}</h4>
        <span class="lobby-sub">${player ? player.name : '(player)'} entering · payer wallet ${shortAddr(customerAddress)}</span>
      </div>
      <div class="lobby-buyin">${ICON.coin}<span class="lobby-buyin-value">${amountXlm}</span><span class="lobby-buyin-cur">XLM buy-in</span></div>
      <div class="lobby-split-row vault">${ICON.trophy}<span>Arena vault (90%)</span><b>${(amountXlm * 0.9).toFixed(2)} XLM → ${shortAddr(config.vaultAddress)}</b></div>
      <div class="lobby-split-row community"><span>Community fund (10%)</span><b>${(amountXlm * 0.1).toFixed(2)} XLM → ${shortAddr(config.communityAddress)}</b></div>
      <div class="lobby-meta">
        <span class="badge testnet-badge">${config.network.toUpperCase()}</span>
        <span class="lobby-fee">Network fee: small XLM fee, shown by Freighter</span>
      </div>
    </div>
    <p class="pay-note">Review the network, amount and recipients in Freighter before approving. Testnet funds have no real value. The buy-in is the XLM amount paid through the 90/10 split.</p>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closePayModal()">Cancel</button>
      <button class="btn-sign btn-enter-arena" id="btn-approve-pay">Enter arena</button>
    </div>
    <div id="pay-status-slot"></div>`;

  document.getElementById('btn-approve-pay').addEventListener('click', () =>
    prepareAndSign(entry, customerAddress, amountXlm)
  );
}

// ---------- Step 3–4: server prepares; Freighter signs the original XDR ----------
async function prepareAndSign(entry, customerAddress, amountXlm) {
  const btn = document.getElementById('btn-approve-pay');
  const slot = document.getElementById('pay-status-slot');
  btn.disabled = true;
  slot.innerHTML = `<div class="pay-status pending">Preparing transaction (server)…</div>`;

  let prep;
  try {
    prep = await apiPost('/api/checkout/prepare', {
      entryId: entry.number,
      amountXlm,
      customerAddress
    });
  } catch (err) {
    if (err.code === 'PREPARATION_EXPIRED') {
      // Retain the record; do not silently prepare a replacement.
      slot.innerHTML = `<div class="pay-status error">The previous preparation expired. Use <b>Check payment</b> on the entry, or contact support with the entry number — do not pay again blindly.</div>`;
    } else {
      slot.innerHTML = `<div class="pay-status error">Preparation failed: ${err.message}</div>`;
    }
    btn.disabled = false;
    return;
  }

  slot.innerHTML = `<div class="pay-status pending">Confirm the transaction in Freighter…</div>`;

  let signedXdr;
  try {
    // Sign the ORIGINAL unsigned XDR with the preparation's passphrase.
    signedXdr = await window.freighterConnect.signTransaction(prep.unsignedXdr, {
      networkPassphrase: prep.networkPassphrase
    });
  } catch (err) {
    slot.innerHTML = `<div class="pay-status error">Signing was cancelled or failed (${err.message}). The preparation is saved — use <b>Check payment</b> to recover instead of starting over.</div>`;
    btn.disabled = false;
    return;
  }

  slot.innerHTML = `<div class="pay-status pending">Submitting signed transaction…</div>`;

  // ---------- Step 5: submit through the server ----------
  let submitted;
  try {
    submitted = await apiPost('/api/checkout/submit', { entryId: entry.number, signedXdr });
  } catch (err) {
    if (err.code === 'SUBMIT_UNCERTAIN' || err.code === 'ENVELOPE_MISMATCH') {
      slot.innerHTML = `<div class="pay-status error">${err.message}. The original record is retained — use <b>Check payment</b> before trying anything else.</div>`;
    } else {
      slot.innerHTML = `<div class="pay-status error">Submission failed: ${err.message}. Use <b>Check payment</b> to recover the original transaction.</div>`;
    }
    btn.disabled = false;
    return;
  }

  savePaymentRecord(entry.number, { txHash: submitted.txHash, status: 'submitted', checkedAt: new Date().toISOString() });
  renderAll();
  showPending(entry, submitted.txHash);
}

// ---------- Step 6: wait for verification before marking paid ----------
function showPending(entry, txHash) {
  const expertUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  payModalBody.innerHTML = `
    <div class="pay-status pending">
      Buy-in submitted.<br>Transaction: <a href="${expertUrl}" target="_blank" rel="noopener">${shortAddr(txHash)}</a><br>
      Waiting for on-chain confirmation and payout verification…
    </div>
    <div id="pay-status-slot"></div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closePayModal()">Close (auto-check continues in background)</button>
      <button class="btn-sign" onclick="checkPayment(${entry.number}, true)">Check payment now</button>
    </div>`;

  // Poll until a terminal state (paid / failed / expired) or ~5 minutes.
  // Stellar event feeds can lag well past the first confirmation.
  let attempts = 0;
  if (payTimer) clearInterval(payTimer);
  payTimer = setInterval(async () => {
    attempts++;
    const done = await checkPayment(entry.number, false); // marks paid automatically when verified
    if (done || attempts >= 60) {
      clearInterval(payTimer); payTimer = null;
      if (!done && !findEntryByNumber(entry.number)?.paid) {
        // Out of polling budget without a terminal state — leave the record
        // pending; the next page load's auto-resolve sweep will pick it up.
        renderAll();
      }
    }
  }, 5000);
}

// ---------- Step 11: check / recover the ORIGINAL transaction ----------
async function checkPayment(entryNumber, showInModal) {
  const entry = findEntryByNumber(entryNumber);
  if (!entry) return true;

  if (showInModal) {
    payModal.hidden = false;
    payModalBody.innerHTML = `<div class="pay-status pending">Checking the original transaction…</div>`;
    if (payTimer) { clearInterval(payTimer); payTimer = null; }
  }

  let status;
  try {
    status = await (await fetch(`/api/checkout/status/${entryNumber}`)).json();
    // The server's order store predates this payment (e.g. orders.json was
    // cleared) — fall back to verifying by the original hash the browser kept.
    if (status?.error?.code === 'ORDER_NOT_FOUND') {
      const rec = getPaymentRecord(entryNumber);
      if (rec?.txHash) {
        const vt = await (await fetch('/api/checkout/verify-tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash: rec.txHash, amountXlm: entry.buyIn.toFixed(2) })
        })).json();
        if (vt?.state === 'submitted') status = vt;
      }
    }
  } catch {
    status = { state: 'error', detail: 'Payment server unreachable' };
  }

  const slot = document.getElementById('pay-status-slot');
  const render = html => {
    if (showInModal) {
      payModalBody.innerHTML = html;
    } else if (slot) {
      slot.innerHTML = html;
    }
  };

  // Recovery table from guide step 11:
  switch (status.state) {
    case 'created':
    case 'prepared':
      render(`<div class="pay-status pending">A preparation exists but no signed transaction was submitted yet.
        Return to the entry and finish the payment before it expires (${status.review?.preparationTtlRemaining ?? '?'}s left).</div>
        <div class="modal-actions"><button class="btn-cancel" onclick="closePayModal()">Close</button></div>`);
      return false;

    case 'preparation_expired':
      render(`<div class="pay-status error">The preparation expired. Do NOT start a new payment blindly — an error never proves nothing was sent. Contact support with the entry number and deployment UUID.</div>
        <div class="modal-actions"><button class="btn-cancel" onclick="closePayModal()">Close</button></div>`);
      return true;

    case 'submitted':
      if (status.verified) {
        savePaymentRecord(entryNumber, { txHash: status.txHash, status: 'verified', checkedAt: new Date().toISOString() });
        if (!entry.paid) markPaid(entry.number); // only now is the entry fulfilled
        render(`<div class="pay-status success">✅ Buy-in confirmed and verified on testnet:<br>
          ${status.expectedPayouts.vaultXlm} XLM → Arena vault, ${status.expectedPayouts.communityXlm} XLM → community fund.<br>
          <a href="https://stellar.expert/explorer/testnet/tx/${status.txHash}" target="_blank" rel="noopener">View transaction</a></div>
          <div class="modal-actions"><button class="btn-sign" onclick="closePayModal()">Done</button></div>`);
        return true;
      }
      if (status.status === 'SUCCESS') {
        // On chain but payout evidence incomplete — check again, do not re-pay.
        savePaymentRecord(entryNumber, { txHash: status.txHash, status: 'verifying', checkedAt: new Date().toISOString() });
        render(`<div class="pay-status pending">Transaction succeeded (${status.status}) but payout evidence is still incomplete (events seen: ${status.eventsSeen}). Indexed feeds can lag — auto-check continues in the background. Do not create another payment.</div>
          <div class="modal-actions"><button class="btn-sign" onclick="checkPayment(${entryNumber}, true)">Check again</button></div>`);
        return false;
      }
      if (status.status === 'FAILED') {
        savePaymentRecord(entryNumber, { txHash: status.txHash, status: 'failed', checkedAt: new Date().toISOString() });
        render(`<div class="pay-status error">Transaction <a href="https://stellar.expert/explorer/testnet/tx/${status.txHash}" target="_blank" rel="noopener">${shortAddr(status.txHash)}</a> FAILED. Keep this record and fix the cause before a deliberate new attempt — never auto-retry.</div>
          <div class="modal-actions"><button class="btn-cancel" onclick="closePayModal()">Close</button></div>`);
        return true;
      }
      // PENDING / UNKNOWN / etc.
      savePaymentRecord(entryNumber, { txHash: status.txHash, status: 'pending', checkedAt: new Date().toISOString() });
      render(`<div class="pay-status pending">Transaction ${status.txHash ? `<a href="https://stellar.expert/explorer/testnet/tx/${status.txHash}" target="_blank" rel="noopener">${shortAddr(status.txHash)}</a>` : ''} is ${status.status ?? 'PENDING'}. An error or pending state never proves nothing was broadcast — keep the original record and check again.</div>
        <div class="modal-actions"><button class="btn-sign" onclick="checkPayment(${entryNumber}, true)">Check again</button></div>`);
      return false;

    case 'unknown':
    default:
      render(`<div class="pay-status error">Finality could not be established${status.detail ? `: ${status.detail}` : ''}. The original payment record is retained — do not reset the order or pay again. Contact support with the deployment UUID and transaction hash.</div>
        <div class="modal-actions"><button class="btn-sign" onclick="checkPayment(${entryNumber}, true)">Check again</button></div>`);
      return false;
  }
}

/* ============================================================
   IMPACT DASHBOARD + ACTIVITY FEED
   Live "follow the money" totals and an entries feed, both
   refreshed automatically every 10 seconds (matching the demo
   storefront pattern; feeds can lag behind the ledger).
   ============================================================ */
function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function refreshImpact() {
  try {
    const data = await (await fetch('/api/impact')).json();
    if (!data || data.error) return;

    document.getElementById('impact-vault-total').textContent = data.vault.totalXlm;
    document.getElementById('impact-community-total').textContent = data.community.totalXlm;
    document.getElementById('impact-combined').textContent = data.combinedXlm;
    document.getElementById('impact-vault-addr').textContent = shortAddr(data.vault.address);
    document.getElementById('impact-community-addr').textContent = shortAddr(data.community.address);
    document.getElementById('impact-vault-bar').style.width = `${data.vault.milestone.pct}%`;
    document.getElementById('impact-community-bar').style.width = `${data.community.milestone.pct}%`;
    document.getElementById('impact-vault-milestone').textContent =
      `Next milestone: ${data.vault.milestone.xlm} XLM`;
    document.getElementById('impact-community-milestone').textContent =
      `Next milestone: ${data.community.milestone.xlm} XLM`;
    document.getElementById('impact-updated').textContent = `last update ${timeAgo(data.updatedAt)}`;
  } catch { /* keep previous values on transient errors */ }
}

// Render activity rows as match tickets: stub (entry # + amount) and a
// perforated body (player · tournament · splits · tx · time).
async function refreshActivity() {
  const feed = document.getElementById('activity-feed');
  try {
    const data = await (await fetch('/api/activity')).json();
    const items = data?.items ?? [];
    if (items.length === 0) {
      feed.innerHTML = '<div class="ticket-empty">No tickets yet — enter a tournament and pay a buy-in with XLM to stamp the first one.</div>';
      return;
    }
    feed.innerHTML = items.map(it => {
      const entry = findEntryByNumber(it.entryId);
      const player = entry ? findPlayer(entry.playerId) : null;
      const tournament = entry ? findTournament(entry.tournamentId) : null;
      const who = player ? player.name : '?';
      const where = tournament ? tournament.title : '?';
      return `
      <div class="ticket">
        <div class="ticket-stub">
          <span class="ticket-icon">${ICON.ticket}</span>
          <span class="ticket-num">ENTRY #${it.entryId}</span>
          <span class="ticket-amount">${ICON.coin}${it.amountXlm} XLM</span>
        </div>
        <div class="ticket-body">
          <span class="ticket-line"><b>${who}</b> · ${where}</span>
          <span class="ticket-detail">
            ${it.txHash
              ? `<a href="https://stellar.expert/explorer/testnet/tx/${it.txHash}" target="_blank" rel="noopener">${shortAddr(it.txHash)}</a>`
              : 'preparation only'}
            ${it.payouts
              ? `<span class="feed-split f">${it.payouts.vaultXlm} → vault</span><span class="feed-split c">${it.payouts.communityXlm} → community</span>`
              : ''}
          </span>
          <span class="ticket-time">${timeAgo(it.at)}</span>
        </div>
      </div>`;
    }).join('');
  } catch {
    // Leave the last good render in place; the next 10s tick retries.
  }
}

refreshImpact();
refreshActivity();
setInterval(() => { refreshImpact(); refreshActivity(); }, 10_000);
