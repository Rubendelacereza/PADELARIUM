const STORAGE_KEY = 'padelflow_state_v3';
const SESSION_KEY = 'padelflow_session';
const THEME_KEY = 'padelflow_theme';

const defaultState = {
  users: [],
  rooms: []
};

const state = loadState();
const app = document.getElementById('app');
const toastContainer = document.getElementById('toastContainer');
const userBadge = document.getElementById('userBadge');

initTheme();
registerServiceWorker();
render();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentUser() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;
  return state.users.find(u => u.id === session) || null;
}

function setSession(userId) { localStorage.setItem(SESSION_KEY, userId); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function uid(prefix = 'id') { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }

function generateRoomCode() {
  let code;
  do {
    code = `PF${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  } while (state.rooms.some(room => room.code === code));
  return code;
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.dataset.theme = stored;
  document.addEventListener('click', e => {
    const btn = e.target.closest('#themeToggle');
    if (!btn) return;
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    toast(next === 'dark' ? 'Modo oscuro activado.' : 'Modo claro activado.');
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}

function render() {
  const user = currentUser();
  if (!user) {
    userBadge.classList.add('hidden');
    renderAuth();
    return;
  }
  userBadge.classList.remove('hidden');
  userBadge.textContent = `👤 ${user.username}`;
  const activeRoom = state.rooms.find(room => room.members.includes(user.id) || room.waitlist?.includes(user.id));
  if (activeRoom && activeRoom.members.includes(user.id)) renderRoom(activeRoom.id);
  else renderLobby();
}

function renderAuth() {
  const tpl = document.getElementById('authTemplate');
  app.innerHTML = '';
  app.appendChild(tpl.content.cloneNode(true));
  bindThemeLabel();
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegister);
}

function handleRegister(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const username = String(form.get('username')).trim();
  const password = String(form.get('password')).trim();
  if (!username || !password) return toast('Completa usuario y contraseña.');
  if (state.users.some(user => user.username.toLowerCase() === username.toLowerCase())) return toast('Ese usuario ya existe.');
  const user = { id: uid('user'), username, password, elo: 1000, createdAt: Date.now() };
  state.users.push(user);
  saveState();
  setSession(user.id);
  toast('Cuenta creada correctamente.');
  render();
}

function handleLogin(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const username = String(form.get('username')).trim();
  const password = String(form.get('password')).trim();
  const user = state.users.find(u => u.username === username && u.password === password);
  if (!user) return toast('Usuario o contraseña incorrectos.');
  setSession(user.id);
  toast(`Bienvenido, ${user.username}.`);
  render();
}

function renderLobby() {
  const tpl = document.getElementById('lobbyTemplate');
  app.innerHTML = '';
  app.appendChild(tpl.content.cloneNode(true));
  bindThemeLabel();

  document.getElementById('logoutBtn').addEventListener('click', () => { clearSession(); render(); });

  document.getElementById('createRoomForm').addEventListener('submit', e => {
    e.preventDefault();
    const user = currentUser();
    const name = new FormData(e.target).get('roomName').toString().trim();
    if (!name) return toast('Ponle nombre a la sala.');
    const room = createRoom(name, user.id);
    saveState();
    toast(`Sala creada con código ${room.code}.`);
    renderRoom(room.id);
  });

  document.getElementById('joinByCodeForm').addEventListener('submit', e => {
    e.preventDefault();
    const code = new FormData(e.target).get('roomCode').toString().trim().toUpperCase();
    const room = state.rooms.find(r => r.code === code);
    if (!room) return toast('Código no encontrado.');
    joinRoom(room.id);
  });

  renderRoomsList();
}

function createRoom(name, adminId) {
  const room = {
    id: uid('room'),
    code: generateRoomCode(),
    name,
    adminId,
    members: [adminId],
    waitlist: [],
    attendance: { [adminId]: true },
    pairs: [],
    rounds: [],
    pairsGenerated: false,
    scheduleGenerated: false,
    history: [],
    chat: [],
    notifications: [],
    createdAt: Date.now(),
    resultAudit: {}
  };
  addHistory(room, `Sala creada por ${getUsername(adminId)}.`);
  notifyRoom(room, 'Nueva sala creada', `${getUsername(adminId)} ha abierto ${name}.`);
  state.rooms.push(room);
  return room;
}

function renderRoomsList() {
  const roomsList = document.getElementById('roomsList');
  if (!state.rooms.length) {
    roomsList.innerHTML = '<div class="empty-state">Todavía no hay salas creadas.</div>';
    return;
  }
  const user = currentUser();
  roomsList.innerHTML = state.rooms.slice().sort((a,b)=>b.createdAt-a.createdAt).map(room => {
    const full = room.members.length >= 12;
    const near = room.members.length >= 10 && room.members.length < 12;
    const joined = room.members.includes(user.id);
    const waiting = room.waitlist?.includes(user.id);
    const live = room.scheduleGenerated;
    return `
      <article class="room-card glass-lite">
        <div class="room-card-head">
          <div>
            <strong>${escapeHtml(room.name)}</strong>
            <div class="meta-note">Código ${room.code} · Admin ${escapeHtml(getUsername(room.adminId))}</div>
          </div>
          <button class="btn ${joined ? 'btn-secondary' : full ? 'btn-warning' : 'btn-primary'} btn-small join-room-btn" data-room-id="${room.id}">${joined ? 'Entrar' : full ? 'Lista espera' : 'Unirme'}</button>
        </div>
        <div class="room-meta">
          <div class="meta-box"><strong>${room.members.length}/12</strong><span>Plazas</span></div>
          <div class="meta-box"><strong>${room.waitlist?.length || 0}</strong><span>Espera</span></div>
          <div class="meta-box"><strong>${live ? 'Activa' : 'Prep'}</strong><span>Fase</span></div>
        </div>
        <div class="room-state-tags">
          <span class="status-pill ${full ? 'full' : near ? 'near' : 'open'}">${full ? 'Llena' : near ? 'Casi llena' : 'Abierta'}</span>
          ${live ? '<span class="status-pill live">En juego</span>' : ''}
          ${waiting ? '<span class="chip">En espera</span>' : ''}
        </div>
      </article>`;
  }).join('');
  document.querySelectorAll('.join-room-btn').forEach(btn => btn.addEventListener('click', () => joinRoom(btn.dataset.roomId)));
}

function joinRoom(roomId) {
  const user = currentUser();
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return toast('Sala no encontrada.');
  if (room.members.includes(user.id)) return renderRoom(room.id);
  if (room.waitlist?.includes(user.id)) return toast('Ya estás en la lista de espera.');
  if (room.members.length >= 12) {
    room.waitlist.push(user.id);
    addHistory(room, `${user.username} entra en lista de espera.`);
    notifyRoom(room, 'Sala llena', `${user.username} ha entrado a la lista de espera.`);
    saveState();
    renderLobby();
    return toast('Sala llena. Te hemos metido en la lista de espera.');
  }
  room.members.push(user.id);
  room.attendance[user.id] = true;
  addHistory(room, `${user.username} entra en la sala.`);
  notifyRoom(room, 'Nuevo jugador', `${user.username} se ha unido a la sala.`);
  saveState();
  renderRoom(room.id);
  toast(`Has entrado en ${room.name}.`);
}

function leaveRoom(roomId) {
  const user = currentUser();
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;
  room.members = room.members.filter(id => id !== user.id);
  room.waitlist = (room.waitlist || []).filter(id => id !== user.id);
  delete room.attendance[user.id];
  if (room.adminId === user.id && room.members.length) room.adminId = room.members[0];
  addHistory(room, `${user.username} ha salido de la sala.`);
  notifyRoom(room, 'Jugador sale', `${user.username} ha abandonado la sala.`);
  promoteFromWaitlist(room);
  if (!room.members.length) {
    state.rooms = state.rooms.filter(r => r.id !== room.id);
    toast('Sala eliminada al quedarse vacía.');
  } else toast('Has salido de la sala.');
  saveState();
  render();
}

function promoteFromWaitlist(room) {
  if (room.members.length >= 12 || !(room.waitlist?.length)) return;
  const nextId = room.waitlist.shift();
  room.members.push(nextId);
  room.attendance[nextId] = true;
  addHistory(room, `${getUsername(nextId)} sube desde la lista de espera.`);
  notifyRoom(room, 'Plaza liberada', `${getUsername(nextId)} entra desde la lista de espera.`);
}

function renderRoom(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return renderLobby();
  const user = currentUser();
  const isAdmin = room.adminId === user.id;
  const tpl = document.getElementById('roomTemplate');
  app.innerHTML = '';
  app.appendChild(tpl.content.cloneNode(true));
  bindThemeLabel();

  document.getElementById('roomTitle').textContent = room.name;
  document.getElementById('roomMeta').textContent = `Código ${room.code} · Admin: ${getUsername(room.adminId)} · ${room.members.length}/12 jugadores`;
  document.getElementById('copyCodeBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(room.code); toast(`Código ${room.code} copiado.`); }
    catch { toast(`Código de la sala: ${room.code}`); }
  });
  document.getElementById('backLobbyBtn').addEventListener('click', () => renderLobby());

  const cap = document.getElementById('capacityBadge');
  cap.textContent = room.members.length >= 12 ? 'Lleno' : room.members.length >= 10 ? 'Casi lleno' : 'Abierto';
  cap.className = `capacity-badge ${room.members.length >= 12 ? 'full' : room.members.length >= 10 ? 'near' : 'open'}`;

  document.getElementById('roomTopStats').innerHTML = `
    <div class="metric-card glass-lite"><strong>${countConfirmedPlayers(room)}</strong><span>Confirmados</span></div>
    <div class="metric-card glass-lite"><strong>${room.waitlist?.length || 0}</strong><span>En espera</span></div>
    <div class="metric-card glass-lite"><strong>${completedMatches(room)}/${room.rounds.flatMap(r=>r.matches).length || 12}</strong><span>Resultados</span></div>`;

  const playersGrid = document.getElementById('playersGrid');
  playersGrid.innerHTML = room.members.map((id, index) => {
    const confirmed = room.attendance[id] !== false;
    const elo = getUserElo(id);
    return `
      <div class="player-chip ${id === room.adminId ? 'admin' : ''}">
        <div class="chip-main">
          <div class="avatar">${getInitials(getUsername(id))}</div>
          <div>
            <strong>${escapeHtml(getUsername(id))}</strong>
            <div class="player-role">${id === room.adminId ? 'Administrador' : `Jugador ${index+1}`} · ${confirmed ? 'Asistencia ok' : 'Pendiente'} · ELO ${elo}</div>
          </div>
        </div>
        ${isAdmin && id !== user.id ? `<button class="btn btn-danger btn-small remove-player-btn" data-user-id="${id}">Expulsar</button>` : ''}
      </div>`;
  }).join('');
  document.querySelectorAll('.remove-player-btn').forEach(btn => btn.addEventListener('click', () => removePlayer(room.id, btn.dataset.userId)));

  renderAttendance(room, user, isAdmin);
  renderWaitlist(room, isAdmin);
  renderAdminPanel(room, isAdmin);
  renderPairs(room);
  renderMatches(room, isAdmin);
  renderStandings(room);
  renderPlayerStats(room);
  renderHistory(room);
  renderChat(room);
  renderNotifications(room);
}

function renderAttendance(room, user, isAdmin) {
  const wrap = document.getElementById('attendanceCard');
  const confirmed = room.attendance[user.id] !== false;
  wrap.innerHTML = `
    <div class="section-title-row"><h3>Asistencia</h3><span class="subtle">Confirma si vas a jugar</span></div>
    <div class="attendance-grid">
      <div class="waitlist-item">
        <div><strong>Tu estado actual</strong><small>${confirmed ? 'Confirmado para jugar' : 'Marcado como no disponible'}</small></div>
        <button id="toggleAttendanceBtn" class="btn ${confirmed ? 'btn-warning' : 'btn-primary'} btn-small">${confirmed ? 'Marcar no voy' : 'Confirmar asistencia'}</button>
      </div>
      ${isAdmin ? '<div class="meta-note">El admin puede ver quién está pendiente antes de generar parejas.</div>' : ''}
    </div>`;
  document.getElementById('toggleAttendanceBtn').addEventListener('click', () => {
    room.attendance[user.id] = !(room.attendance[user.id] !== false);
    addHistory(room, `${user.username} ${room.attendance[user.id] ? 'confirma asistencia' : 'marca que no irá'}.`);
    notifyRoom(room, 'Cambio de asistencia', `${user.username} ha actualizado su disponibilidad.`);
    saveState();
    renderRoom(room.id);
  });
}

function renderWaitlist(room, isAdmin) {
  const wrap = document.getElementById('waitlistCard');
  if (!room.waitlist?.length) {
    wrap.innerHTML = '<div class="section-title-row"><h3>Lista de espera</h3><span class="subtle">Sin usuarios en espera</span></div>';
    return;
  }
  wrap.innerHTML = `
    <div class="section-title-row"><h3>Lista de espera</h3><span class="subtle">${room.waitlist.length} usuarios esperando</span></div>
    <div class="waitlist-grid">
      ${room.waitlist.map(id => `
        <div class="waitlist-item">
          <div><strong>${escapeHtml(getUsername(id))}</strong><small>Esperando plaza libre</small></div>
          ${isAdmin ? `<button class="btn btn-secondary btn-small promote-btn" data-user-id="${id}">Subir ahora</button>` : ''}
        </div>`).join('')}
    </div>`;
  document.querySelectorAll('.promote-btn').forEach(btn => btn.addEventListener('click', () => forcePromote(room.id, btn.dataset.userId)));
}

function renderAdminPanel(room, isAdmin) {
  const adminPanel = document.getElementById('adminPanel');
  adminPanel.innerHTML = `
    <div class="card glass stack-md">
      <div class="section-title-row"><h3>Controles de sala</h3><span class="subtle">${isAdmin ? 'Tú controlas la sala' : 'Solo el admin puede gestionar'}</span></div>
      <div class="admin-panel-actions">
        <button id="generatePairsBtn" class="btn btn-primary" ${!isAdmin || room.members.length !== 12 || room.pairsGenerated || countConfirmedPlayers(room) !== 12 ? 'disabled' : ''}>Generar parejas</button>
        <button id="generateScheduleBtn" class="btn btn-secondary" ${!isAdmin || !room.pairsGenerated || room.scheduleGenerated ? 'disabled' : ''}>Crear partidos</button>
        <button id="resetTournamentBtn" class="btn btn-warning" ${!isAdmin || completedMatches(room) > 0 ? 'disabled' : ''}>Rehacer torneo</button>
        <button id="leaveRoomBtn" class="btn btn-danger">Salir de la sala</button>
      </div>
      <div class="admin-tools-grid">
        <div class="room-card">
          <strong>Herramientas admin</strong>
          <div class="stack-md" style="margin-top:12px;">
            <div class="tool-row">
              <select id="transferAdminSelect" ${!isAdmin ? 'disabled' : ''}>
                <option value="">Cambiar administrador</option>
                ${room.members.filter(id => id !== room.adminId).map(id => `<option value="${id}">${escapeHtml(getUsername(id))}</option>`).join('')}
              </select>
              <button id="transferAdminBtn" class="btn btn-secondary btn-small" ${!isAdmin ? 'disabled' : ''}>Cambiar</button>
            </div>
            <div class="tool-row">
              <select id="forceJoinSelect" ${!isAdmin || !room.waitlist?.length ? 'disabled' : ''}>
                <option value="">Subir desde espera</option>
                ${room.waitlist.map(id => `<option value="${id}">${escapeHtml(getUsername(id))}</option>`).join('')}
              </select>
              <button id="forceJoinBtn" class="btn btn-primary btn-small" ${!isAdmin || !room.waitlist?.length ? 'disabled' : ''}>Subir</button>
            </div>
          </div>
        </div>
        <div class="room-card">
          <strong>Nivel Pro</strong>
          <div class="stack-sm" style="margin-top:12px;">
            <div class="chip-row">
              <span class="chip">ELO</span>
              <span class="chip">Chat</span>
              <span class="chip">Avisos</span>
              <span class="chip">PWA</span>
            </div>
            <div class="meta-note">Ahora la demo también incluye ranking ELO individual, chat de sala, centro de avisos y soporte instalable.</div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('leaveRoomBtn').addEventListener('click', () => leaveRoom(room.id));
  document.getElementById('generatePairsBtn')?.addEventListener('click', () => handleGeneratePairs(room.id));
  document.getElementById('generateScheduleBtn')?.addEventListener('click', () => handleGenerateSchedule(room.id));
  document.getElementById('resetTournamentBtn')?.addEventListener('click', () => resetTournament(room.id));
  document.getElementById('transferAdminBtn')?.addEventListener('click', () => transferAdmin(room.id));
  document.getElementById('forceJoinBtn')?.addEventListener('click', () => {
    const userId = document.getElementById('forceJoinSelect').value;
    if (userId) forcePromote(room.id, userId);
  });
}

function handleGeneratePairs(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;
  if (room.pairsGenerated) return toast('Las parejas ya fueron generadas.');
  if (room.members.length !== 12) return toast('Necesitas exactamente 12 jugadores.');
  if (countConfirmedPlayers(room) !== 12) return toast('Todos deben confirmar asistencia antes de sortear.');
  const shuffled = shuffle([...room.members]);
  room.pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) room.pairs.push({ id: uid('pair'), playerIds: [shuffled[i], shuffled[i+1]] });
  room.pairsGenerated = true;
  addHistory(room, 'Se generan las 6 parejas de forma aleatoria.');
  notifyRoom(room, 'Parejas listas', 'El administrador ha generado las parejas de la jornada.');
  saveState();
  renderRoom(roomId);
  toast('Parejas generadas aleatoriamente.');
}

function handleGenerateSchedule(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room?.pairsGenerated) return toast('Genera primero las parejas.');
  if (room.scheduleGenerated) return toast('El calendario ya fue creado.');
  const rounds = generateRoundRobin(room.pairs.map(p => p.id)).slice(0, 4).map((round, idx) => ({
    id: uid('round'),
    number: idx + 1,
    mvpPlayerId: '',
    matches: round.map((pairing, mIdx) => ({
      id: uid('match'),
      court: mIdx + 1,
      pairAId: pairing[0],
      pairBId: pairing[1],
      result: null
    }))
  }));
  room.rounds = rounds;
  room.scheduleGenerated = true;
  addHistory(room, 'Se crean las jornadas automáticas sin repetir rivales.');
  notifyRoom(room, 'Calendario listo', 'Ya están creadas las jornadas y pistas.');
  saveState();
  renderRoom(roomId);
  toast('Partidos creados correctamente.');
}

function resetTournament(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;
  if (completedMatches(room) > 0) return toast('No puedes rehacer el torneo cuando ya hay resultados.');
  room.pairs = [];
  room.rounds = [];
  room.pairsGenerated = false;
  room.scheduleGenerated = false;
  addHistory(room, 'El administrador rehace el torneo antes de jugar.');
  notifyRoom(room, 'Torneo rehecho', 'Se han reseteado parejas y jornadas.');
  saveState();
  renderRoom(roomId);
}

function transferAdmin(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  const nextAdmin = document.getElementById('transferAdminSelect')?.value;
  if (!room || !nextAdmin) return toast('Selecciona a un nuevo administrador.');
  room.adminId = nextAdmin;
  addHistory(room, `${getUsername(nextAdmin)} ahora es administrador.`);
  notifyRoom(room, 'Nuevo admin', `${getUsername(nextAdmin)} ahora controla la sala.`);
  saveState();
  renderRoom(roomId);
}

function forcePromote(roomId, userId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room || room.members.length >= 12) return toast('No hay hueco libre para subirlo.');
  room.waitlist = room.waitlist.filter(id => id !== userId);
  room.members.push(userId);
  room.attendance[userId] = true;
  addHistory(room, `${getUsername(userId)} sube manualmente desde la espera.`);
  notifyRoom(room, 'Promoción manual', `${getUsername(userId)} ya tiene plaza.`);
  saveState();
  renderRoom(roomId);
}

function removePlayer(roomId, userId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;
  room.members = room.members.filter(id => id !== userId);
  delete room.attendance[userId];
  addHistory(room, `${getUsername(userId)} ha sido expulsado de la sala.`);
  notifyRoom(room, 'Jugador expulsado', `${getUsername(userId)} sale de la sala.`);
  promoteFromWaitlist(room);
  saveState();
  renderRoom(roomId);
}

function renderPairs(room) {
  const wrap = document.getElementById('pairsList');
  if (!room.pairsGenerated) {
    wrap.innerHTML = '<div class="empty-state">Las parejas aparecerán cuando el administrador pulse el botón.</div>';
    return;
  }
  wrap.innerHTML = room.pairs.map((pair, idx) => `
    <article class="pair-card reveal-card">
      <strong>Pareja ${idx + 1}</strong>
      <div class="meta-note">${pair.playerIds.map(id => escapeHtml(getUsername(id))).join(' · ')}</div>
    </article>`).join('');
}

function renderMatches(room, isAdmin) {
  const wrap = document.getElementById('matchesBoard');
  if (!room.scheduleGenerated) {
    wrap.innerHTML = '<div class="empty-state">Las jornadas aparecerán cuando el administrador cree los partidos.</div>';
    return;
  }
  wrap.innerHTML = room.rounds.map(round => {
    const mvp = calculateRoundMvp(room, round);
    return `
      <section class="round-card glass-lite">
        <div class="section-title-row"><h3>Jornada ${round.number}</h3><span class="subtle">${mvp ? `MVP: ${escapeHtml(mvp)}` : 'Sin MVP todavía'}</span></div>
        <div class="stack-md">
          ${round.matches.map(match => {
            const pairA = room.pairs.find(p => p.id === match.pairAId);
            const pairB = room.pairs.find(p => p.id === match.pairBId);
            return `
              <article class="match-card">
                <div class="match-head">
                  <strong>Pista ${match.court}</strong>
                  <span class="chip">${match.result ? 'Resultado guardado' : 'Pendiente'}</span>
                </div>
                <div class="match-vs">${pairA.playerIds.map(getUsername).join(' / ')} <span>vs</span> ${pairB.playerIds.map(getUsername).join(' / ')}</div>
                <form class="result-form" data-room-id="${room.id}" data-match-id="${match.id}">
                  ${renderSetInputs(match.result)}
                  <button class="btn btn-primary btn-small" type="submit" ${!isAdmin ? 'disabled' : ''}>Guardar</button>
                </form>
              </article>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');
  document.querySelectorAll('.result-form').forEach(form => form.addEventListener('submit', handleResultSave));
}

function renderSetInputs(result = null) {
  const value = key => result?.[key] ?? '';
  return `
    <div class="set-grid">
      <input type="number" name="a1" min="0" max="7" value="${value('a1')}"><input type="number" name="b1" min="0" max="7" value="${value('b1')}">
      <input type="number" name="a2" min="0" max="7" value="${value('a2')}"><input type="number" name="b2" min="0" max="7" value="${value('b2')}">
      <input type="number" name="a3" min="0" max="7" value="${value('a3')}"><input type="number" name="b3" min="0" max="7" value="${value('b3')}">
    </div>`;
}

function handleResultSave(e) {
  e.preventDefault();
  const room = state.rooms.find(r => r.id === e.target.dataset.roomId);
  const match = room?.rounds.flatMap(r => r.matches).find(m => m.id === e.target.dataset.matchId);
  if (!room || !match) return;
  const form = new FormData(e.target);
  const result = Object.fromEntries([...form.entries()].map(([k,v]) => [k, v === '' ? '' : Number(v)]));
  const winner = getWinnerFromResult(result);
  if (!winner) return toast('El resultado no determina un ganador válido.');
  match.result = result;
  applyEloFromMatch(room, match);
  addHistory(room, `Resultado guardado en jornada ${findRoundNumber(room, match.id)} pista ${match.court}: ${summarizeResult(result)}.`);
  notifyRoom(room, 'Resultado subido', `J${findRoundNumber(room, match.id)} · pista ${match.court} · ${summarizeResult(result)}`);
  saveState();
  renderRoom(room.id);
  toast('Resultado guardado correctamente.');
}

function renderStandings(room) {
  const tableWrap = document.getElementById('standingsTable');
  const podiumWrap = document.getElementById('standingsPodium');
  if (!room.pairsGenerated) {
    podiumWrap.innerHTML = '';
    tableWrap.innerHTML = '<div class="empty-state">La clasificación aparecerá cuando existan parejas.</div>';
    return;
  }
  const standings = buildStandings(room);
  podiumWrap.innerHTML = standings.slice(0,3).length ? `
    <div class="podium">${standings.slice(0,3).map((row,idx)=>`
      <div class="podium-card ${idx===0 ? 'first' : ''}">
        <div class="podium-rank">#${idx+1}</div><div class="podium-name">${escapeHtml(row.label)}</div><div class="podium-points">${row.points} pts</div>
      </div>`).join('')}</div>` : '';
  tableWrap.innerHTML = `
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Pareja</th><th>PJ</th><th>PG</th><th>PP</th><th>SF</th><th>SC</th><th>JF</th><th>JC</th><th>PTS</th></tr></thead>
      <tbody>${standings.map((row,idx)=>`<tr><td>${idx+1}</td><td>${escapeHtml(row.label)}</td><td>${row.played}</td><td>${row.wins}</td><td>${row.losses}</td><td>${row.setsFor}</td><td>${row.setsAgainst}</td><td>${row.gamesFor}</td><td>${row.gamesAgainst}</td><td><strong>${row.points}</strong></td></tr>`).join('')}</tbody></table></div>`;
}

function buildStandings(room) {
  const stats = room.pairs.map(pair => ({
    pairId: pair.id, label: pair.playerIds.map(getUsername).join(' / '),
    played: 0, wins: 0, losses: 0, setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0, points: 0
  }));
  const index = Object.fromEntries(stats.map(s => [s.pairId, s]));
  room.rounds.forEach(round => round.matches.forEach(match => {
    if (!match.result) return;
    const outcome = getWinnerFromResult(match.result); if (!outcome) return;
    const a = index[match.pairAId], b = index[match.pairBId];
    const { setsA, setsB, gamesA, gamesB } = countSets(match.result);
    a.played++; b.played++; a.setsFor += setsA; a.setsAgainst += setsB; b.setsFor += setsB; b.setsAgainst += setsA; a.gamesFor += gamesA; a.gamesAgainst += gamesB; b.gamesFor += gamesB; b.gamesAgainst += gamesA;
    if (outcome === 'A') { a.wins++; a.points += 3; b.losses++; } else { b.wins++; b.points += 3; a.losses++; }
  }));
  return stats.sort((x,y)=> y.points-x.points || (y.setsFor-y.setsAgainst)-(x.setsFor-x.setsAgainst) || (y.gamesFor-y.gamesAgainst)-(x.gamesFor-x.gamesAgainst) || y.wins-x.wins || x.label.localeCompare(y.label));
}

function renderPlayerStats(room) {
  const eloBoard = document.getElementById('eloBoard');
  const wrap = document.getElementById('playerStatsGrid');
  if (!room.pairsGenerated) {
    eloBoard.innerHTML = '';
    wrap.innerHTML = '<div class="empty-state">Las estadísticas individuales aparecerán cuando haya parejas y resultados.</div>';
    return;
  }
  const profiles = buildPlayerProfiles(room);
  eloBoard.innerHTML = `
    <div class="section-title-row"><h4>Ranking ELO individual</h4><span class="subtle">Actualizado con cada resultado</span></div>
    <div class="elo-grid">${profiles.slice(0,6).map((p,idx)=>`<div class="elo-card"><strong>#${idx+1}</strong><span>${escapeHtml(p.name)}</span><b>${p.elo}</b></div>`).join('')}</div>`;
  wrap.innerHTML = profiles.map(profile => `
    <article class="player-profile-card">
      <div class="player-row"><div class="chip-main"><div class="avatar">${getInitials(profile.name)}</div><div><strong>${escapeHtml(profile.name)}</strong><div class="player-role">${profile.bestPartner ? `Mejor compi: ${escapeHtml(profile.bestPartner)}` : 'Sin datos aún'}</div></div></div><span class="chip">${profile.streak}</span></div>
      <div class="stat-line">
        <div class="mini-stat"><strong>${profile.played}</strong><span>PJ</span></div>
        <div class="mini-stat"><strong>${profile.wins}</strong><span>PG</span></div>
        <div class="mini-stat"><strong>${profile.winRate}%</strong><span>Win rate</span></div>
        <div class="mini-stat"><strong>${profile.elo}</strong><span>ELO</span></div>
      </div>
    </article>`).join('');
}

function buildPlayerProfiles(room) {
  const pairById = Object.fromEntries(room.pairs.map(pair => [pair.id, pair]));
  const profiles = Object.fromEntries(room.members.map(userId => [userId, { userId, name: getUsername(userId), played: 0, wins: 0, losses: 0, recent: [], partnerCount: {}, elo: getUserElo(userId) }]));
  room.rounds.forEach(round => round.matches.forEach(match => {
    if (!match.result) return;
    const pairA = pairById[match.pairAId], pairB = pairById[match.pairBId], winner = getWinnerFromResult(match.result);
    [pairA, pairB].forEach((pair, idx) => {
      const won = (idx === 0 && winner === 'A') || (idx === 1 && winner === 'B');
      pair.playerIds.forEach(playerId => {
        profiles[playerId].played++;
        profiles[playerId][won ? 'wins' : 'losses']++;
        profiles[playerId].recent.push(won ? 'W' : 'L');
        const mate = pair.playerIds.find(id => id !== playerId);
        profiles[playerId].partnerCount[mate] = (profiles[playerId].partnerCount[mate] || 0) + 1;
      });
    });
  }));
  return Object.values(profiles).map(profile => {
    const bestPartnerId = Object.entries(profile.partnerCount).sort((a,b)=>b[1]-a[1])[0]?.[0];
    const recent = profile.recent.slice(-5).join('');
    const streak = recent.endsWith('WWW') ? 'Racha 3W' : recent.endsWith('LLL') ? 'Racha 3L' : recent ? `Último ${profile.recent.at(-1)}` : 'Sin jugar';
    return { ...profile, winRate: profile.played ? Math.round(profile.wins/profile.played*100) : 0, bestPartner: bestPartnerId ? getUsername(bestPartnerId) : '', streak };
  }).sort((a,b)=> b.elo-a.elo || b.wins-a.wins || b.winRate-a.winRate || a.name.localeCompare(b.name));
}

function renderHistory(room) {
  const wrap = document.getElementById('historyFeed');
  const items = (room.history || []).slice().reverse().slice(0, 12);
  wrap.innerHTML = items.length ? items.map(item => `<div class="history-item"><div class="history-dot"></div><div><strong>${escapeHtml(item.text)}</strong><br><small>${formatDate(item.at)}</small></div></div>`).join('') : '<div class="empty-state">Aún no hay actividad registrada.</div>';
}

function renderChat(room) {
  const feed = document.getElementById('chatMessages');
  const form = document.getElementById('chatForm');
  const user = currentUser();
  const messages = (room.chat || []).slice(-25);
  feed.innerHTML = messages.length ? messages.map(msg => `
    <div class="chat-msg ${msg.userId === user.id ? 'mine' : ''}">
      <strong>${escapeHtml(getUsername(msg.userId))}</strong>
      <p>${escapeHtml(msg.text)}</p>
      <small>${formatDate(msg.at)}</small>
    </div>`).join('') : '<div class="empty-state">Todavía no hay mensajes en la sala.</div>';
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = new FormData(form).get('message').toString().trim();
    if (!text) return;
    room.chat = room.chat || [];
    room.chat.push({ id: uid('msg'), userId: user.id, text, at: Date.now() });
    addHistory(room, `${user.username} ha enviado un mensaje al chat.`);
    saveState();
    renderRoom(room.id);
  });
}

function renderNotifications(room) {
  const wrap = document.getElementById('notificationsFeed');
  const notifications = (room.notifications || []).slice().reverse().slice(0, 10);
  wrap.innerHTML = notifications.length ? notifications.map(item => `<div class="history-item"><div class="history-dot pulse"></div><div><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.text)} · ${formatDate(item.at)}</small></div></div>`).join('') : '<div class="empty-state">Sin avisos todavía.</div>';
}

function notifyRoom(room, title, text) {
  room.notifications = room.notifications || [];
  room.notifications.push({ id: uid('n'), title, text, at: Date.now() });
}

function applyEloFromMatch(room, match) {
  if (room.resultAudit?.[match.id]) return;
  const winner = getWinnerFromResult(match.result);
  if (!winner) return;
  const pairA = room.pairs.find(p => p.id === match.pairAId);
  const pairB = room.pairs.find(p => p.id === match.pairBId);
  const avgA = average(pairA.playerIds.map(getUserElo));
  const avgB = average(pairB.playerIds.map(getUserElo));
  const expectedA = 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
  const expectedB = 1 - expectedA;
  const scoreA = winner === 'A' ? 1 : 0;
  const scoreB = 1 - scoreA;
  const k = 24;
  const deltaA = Math.round(k * (scoreA - expectedA));
  const deltaB = Math.round(k * (scoreB - expectedB));
  pairA.playerIds.forEach(id => adjustUserElo(id, deltaA));
  pairB.playerIds.forEach(id => adjustUserElo(id, deltaB));
  room.resultAudit = room.resultAudit || {};
  room.resultAudit[match.id] = true;
}

function adjustUserElo(userId, delta) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;
  user.elo = (user.elo || 1000) + delta;
}

function getUserElo(userId) {
  return state.users.find(u => u.id === userId)?.elo || 1000;
}

function calculateRoundMvp(room, round) {
  const tally = {};
  round.matches.forEach(match => {
    if (!match.result) return;
    const winner = getWinnerFromResult(match.result);
    const pair = room.pairs.find(p => p.id === (winner === 'A' ? match.pairAId : match.pairBId));
    const games = countSets(match.result);
    pair.playerIds.forEach(id => { tally[id] = (tally[id] || 0) + 10 + (winner === 'A' ? games.gamesA : games.gamesB); });
  });
  const bestId = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0]?.[0];
  return bestId ? getUsername(bestId) : '';
}

function countConfirmedPlayers(room) { return room.members.filter(id => room.attendance[id] !== false).length; }
function completedMatches(room) { return room.rounds.flatMap(r => r.matches).filter(m => m.result).length; }
function findRoundNumber(room, matchId) { return room.rounds.find(round => round.matches.some(match => match.id === matchId))?.number || '-'; }
function addHistory(room, text) { room.history = room.history || []; room.history.push({ id: uid('h'), text, at: Date.now() }); }

function getWinnerFromResult(result) {
  const { setsA, setsB } = countSets(result);
  if (setsA === setsB) return null;
  return setsA > setsB ? 'A' : 'B';
}

function countSets(result) {
  const setPairs = [[result.a1,result.b1],[result.a2,result.b2],[result.a3,result.b3]];
  let setsA=0, setsB=0, gamesA=0, gamesB=0;
  for (const [a,b] of setPairs) {
    if (a === '' || b === '' || Number.isNaN(a) || Number.isNaN(b)) continue;
    gamesA += Number(a); gamesB += Number(b);
    if (a === b) continue;
    if (a > b) setsA++; else setsB++;
  }
  return { setsA, setsB, gamesA, gamesB };
}

function summarizeResult(result) {
  const pieces = [];
  [['a1','b1'],['a2','b2'],['a3','b3']].forEach(([a,b]) => { if (result[a] !== '' && result[b] !== '') pieces.push(`${result[a]}-${result[b]}`); });
  return pieces.length ? pieces.join(' · ') : 'Sin resultado';
}

function getUsername(userId) { return state.users.find(u => u.id === userId)?.username || 'Jugador'; }
function getInitials(name) { return name.split(' ').slice(0,2).map(part => part[0]?.toUpperCase() || '').join('') || 'J'; }
function formatDate(timestamp) { return new Date(timestamp).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); }
function average(arr) { return arr.reduce((a,b)=>a+b,0) / (arr.length || 1); }
function escapeHtml(str) { return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function shuffle(array) { for (let i=array.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [array[i],array[j]]=[array[j],array[i]]; } return array; }
function generateRoundRobin(teams) {
  const arr = [...teams]; if (arr.length % 2 !== 0) arr.push(null);
  const rounds = [];
  for (let r=0;r<arr.length-1;r++) {
    const matches=[];
    for (let i=0;i<arr.length/2;i++) {
      const home=arr[i], away=arr[arr.length-1-i];
      if (home !== null && away !== null) matches.push([home, away]);
    }
    rounds.push(matches);
    arr.splice(1,0,arr.pop());
  }
  return rounds;
}

function bindThemeLabel() {
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀︎' : '☾';
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  toastContainer.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}
