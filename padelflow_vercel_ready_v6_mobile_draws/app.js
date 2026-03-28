const STORAGE_KEY = 'padelflow_ultra_state';
const SESSION_KEY = 'padelflow_ultra_session';
const THEME_KEY = 'padelflow_ultra_theme';
const MOTION_KEY = 'padelflow_ultra_motion';
const APP_VERSION = 1;
const MAX_PLAYERS = 12;
const MAX_PAIRS = 6;
const ROUNDS_TO_PLAY = 4;
const LEVELS = [
  { min: 0, name: 'Bronce' },
  { min: 1030, name: 'Plata' },
  { min: 1080, name: 'Oro' },
  { min: 1140, name: 'Diamante' },
  { min: 1210, name: 'Élite' }
];
const ACHIEVEMENTS = [
  { id: 'first_win', title: 'Primera victoria', desc: 'Gana tu primer partido.' },
  { id: 'three_wins', title: 'Triplete', desc: 'Consigue 3 victorias totales.' },
  { id: 'streak3', title: 'En racha', desc: 'Encadena 3 victorias seguidas.' },
  { id: 'perfect_day', title: 'Invicto', desc: 'Gana todos tus partidos del torneo actual.' },
  { id: 'hundred_games', title: 'Guerrero', desc: 'Supera 100 juegos ganados acumulados.' }
];

const defaultState = { version: APP_VERSION, users: [], rooms: [] };
const state = loadState();
const app = document.getElementById('mainContent');
const toastContainer = document.getElementById('toastContainer');
const userBadge = document.getElementById('userBadge');

initPreferences();
registerServiceWorker();
render();

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== 'object') return structuredClone(defaultState);
    return sanitizeState(raw);
  } catch {
    return structuredClone(defaultState);
  }
}

function sanitizeState(raw) {
  const clean = structuredClone(defaultState);
  clean.users = Array.isArray(raw.users) ? raw.users.map(sanitizeUser) : [];
  clean.rooms = Array.isArray(raw.rooms) ? raw.rooms.map(sanitizeRoom) : [];
  return clean;
}

function sanitizeUser(user) {
  return {
    id: String(user.id || uid('user')),
    username: String(user.username || 'Jugador').slice(0, 20),
    password: String(user.password || ''),
    elo: Number.isFinite(user.elo) ? Math.round(user.elo) : 1000,
    createdAt: Number.isFinite(user.createdAt) ? user.createdAt : Date.now(),
    stats: sanitizeStats(user.stats),
    achievements: Array.isArray(user.achievements) ? [...new Set(user.achievements.map(String))] : [],
    isGuest: Boolean(user.isGuest)
  };
}

function sanitizeStats(stats = {}) {
  return {
    played: Number(stats.played) || 0,
    wins: Number(stats.wins) || 0,
    losses: Number(stats.losses) || 0,
    setsWon: Number(stats.setsWon) || 0,
    setsLost: Number(stats.setsLost) || 0,
    gamesWon: Number(stats.gamesWon) || 0,
    gamesLost: Number(stats.gamesLost) || 0,
    bestPartnerCount: stats.bestPartnerCount && typeof stats.bestPartnerCount === 'object' ? stats.bestPartnerCount : {},
    recent: Array.isArray(stats.recent) ? stats.recent.slice(-10) : []
  };
}

function sanitizeRoom(room) {
  return {
    id: String(room.id || uid('room')),
    code: String(room.code || generateRoomCode()).slice(0, 8).toUpperCase(),
    name: String(room.name || 'Sala').slice(0, 30),
    adminId: String(room.adminId || ''),
    members: Array.isArray(room.members) ? uniqueStrings(room.members) : [],
    waitlist: Array.isArray(room.waitlist) ? uniqueStrings(room.waitlist) : [],
    attendance: room.attendance && typeof room.attendance === 'object' ? room.attendance : {},
    pairs: Array.isArray(room.pairs) ? room.pairs.map(pair => ({ id: String(pair.id || uid('pair')), playerIds: Array.isArray(pair.playerIds) ? pair.playerIds.slice(0, 2) : [] })) : [],
    rounds: Array.isArray(room.rounds) ? room.rounds.map(round => ({
      number: Number(round.number) || 1,
      matches: Array.isArray(round.matches) ? round.matches.map(match => ({
        id: String(match.id || uid('match')),
        court: Number(match.court) || 1,
        pairAId: String(match.pairAId || ''),
        pairBId: String(match.pairBId || ''),
        result: match.result ? sanitizeResult(match.result) : null
      })) : [],
      mvp: typeof round.mvp === 'string' ? round.mvp : ''
    })) : [],
    pairsGenerated: Boolean(room.pairsGenerated),
    scheduleGenerated: Boolean(room.scheduleGenerated),
    history: Array.isArray(room.history) ? room.history.slice(-100).map(item => ({ id: String(item.id || uid('h')), text: String(item.text || ''), at: Number(item.at) || Date.now() })) : [],
    notifications: Array.isArray(room.notifications) ? room.notifications.slice(-50).map(item => ({ id: String(item.id || uid('n')), title: String(item.title || ''), text: String(item.text || ''), at: Number(item.at) || Date.now() })) : [],
    chat: Array.isArray(room.chat) ? room.chat.slice(-100).map(msg => ({ id: String(msg.id || uid('msg')), userId: String(msg.userId || ''), text: String(msg.text || '').slice(0, 180), at: Number(msg.at) || Date.now() })) : [],
    resultAudit: room.resultAudit && typeof room.resultAudit === 'object' ? room.resultAudit : {},
    createdAt: Number(room.createdAt) || Date.now(),
    lastResultMeta: room.lastResultMeta && typeof room.lastResultMeta === 'object' ? room.lastResultMeta : null,
    settings: {
      pairMode: room.settings?.pairMode === 'balanced' ? 'balanced' : 'random'
    }
  };
}


function sanitizeResult(result) {
  const clean = { a1: '', b1: '' };
  ['a1', 'b1'].forEach(key => {
    const value = result[key];
    clean[key] = value === '' || value === null || value === undefined ? '' : Math.max(0, Math.round(Number(value)));
  });
  return clean;
}


function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentUser() {
  const session = localStorage.getItem(SESSION_KEY);
  return state.users.find(user => user.id === session) || null;
}

function setSession(userId) { localStorage.setItem(SESSION_KEY, userId); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function uid(prefix = 'id') { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
function uniqueStrings(arr) { return [...new Set(arr.map(String))]; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function initPreferences() {
  const theme = localStorage.getItem(THEME_KEY) || 'dark';
  const motion = localStorage.getItem(MOTION_KEY) || 'full';
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.motion = motion === 'reduced' ? 'reduced' : 'full';

  document.addEventListener('click', event => {
    const themeBtn = event.target.closest('#themeToggle');
    if (themeBtn) {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
      syncPreferenceLabels();
      toast(next === 'dark' ? 'Modo oscuro activado.' : 'Modo claro activado.');
    }

    const motionBtn = event.target.closest('#motionToggle');
    if (motionBtn) {
      const next = document.documentElement.dataset.motion === 'reduced' ? 'full' : 'reduced';
      document.documentElement.dataset.motion = next;
      localStorage.setItem(MOTION_KEY, next);
      syncPreferenceLabels();
      toast(next === 'reduced' ? 'Animaciones reducidas.' : 'Animaciones activadas.');
    }
  });
  syncPreferenceLabels();
}

function syncPreferenceLabels() {
  const themeBtn = document.getElementById('themeToggle');
  const motionBtn = document.getElementById('motionToggle');
  if (themeBtn) themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀︎' : '☾';
  if (motionBtn) motionBtn.textContent = document.documentElement.dataset.motion === 'reduced' ? '◌' : '◎';
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}

function render() {
  syncPreferenceLabels();
  const user = currentUser();
  if (!user) {
    userBadge.classList.add('hidden');
    renderAuth();
    return;
  }
  userBadge.classList.remove('hidden');
  userBadge.textContent = `👤 ${user.username}`;

  const activeRoom = state.rooms.find(room => room.members.includes(user.id));
  if (activeRoom) renderRoom(activeRoom.id);
  else renderLobby();
}

function renderAuth() {
  app.innerHTML = document.getElementById('authTemplate').innerHTML;
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegister);
}

function handleRegister(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = normalizeUsername(form.get('username'));
  const password = String(form.get('password') || '').trim();
  if (username.length < 3) return toast('El usuario debe tener al menos 3 caracteres.');
  if (password.length < 4) return toast('La contraseña debe tener al menos 4 caracteres.');
  if (state.users.some(user => user.username.toLowerCase() === username.toLowerCase())) return toast('Ese usuario ya existe.');

  const user = sanitizeUser({ id: uid('user'), username, password, elo: 1000, createdAt: Date.now(), stats: sanitizeStats(), achievements: [] });
  state.users.push(user);
  saveState();
  setSession(user.id);
  toast('Cuenta creada correctamente.');
  render();
}

function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = normalizeUsername(form.get('username'));
  const password = String(form.get('password') || '').trim();
  const user = state.users.find(item => item.username.toLowerCase() === username.toLowerCase() && item.password === password);
  if (!user) return toast('Usuario o contraseña incorrectos.');
  setSession(user.id);
  toast(`Bienvenido, ${user.username}.`);
  render();
}

function renderLobby() {
  app.innerHTML = document.getElementById('lobbyTemplate').innerHTML;

  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearSession();
    render();
  });

  document.getElementById('createRoomForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('roomName') || '').trim();
    if (!name) return toast('Ponle nombre a la sala.');
    if (getUserRoom(currentUser().id)) return toast('Primero sal de tu sala actual para crear otra.');
    const room = createRoom(name, currentUser().id);
    saveState();
    toast(`Sala creada con código ${room.code}.`);
    renderRoom(room.id);
  });

  document.getElementById('joinByCodeForm').addEventListener('submit', event => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('roomCode') || '').trim().toUpperCase();
    const room = state.rooms.find(item => item.code === code);
    if (!room) return toast('Código no encontrado.');
    joinRoom(room.id);
  });

  document.getElementById('seedDemoBtn').addEventListener('click', seedDemoData);
  document.getElementById('exportStateBtn').addEventListener('click', exportState);
  document.getElementById('importStateInput').addEventListener('change', importStateFromFile);
  document.getElementById('resetStateBtn').addEventListener('click', resetAllData);

  renderRoomsList();
}

function createRoom(name, adminId) {
  const room = sanitizeRoom({
    id: uid('room'),
    code: generateRoomCode(),
    name: name.slice(0, 30),
    adminId,
    members: [adminId],
    waitlist: [],
    attendance: { [adminId]: true },
    pairs: [],
    rounds: [],
    pairsGenerated: false,
    scheduleGenerated: false,
    history: [],
    notifications: [],
    chat: [],
    resultAudit: {},
    createdAt: Date.now(),
    lastResultMeta: null,
    settings: { pairMode: 'random' }
  });
  state.rooms.push(room);
  addHistory(room, `Sala creada por ${getUsername(adminId)}.`);
  notifyRoom(room, 'Sala creada', `${getUsername(adminId)} ha abierto ${room.name}.`);
  return room;
}

function renderRoomsList() {
  const wrap = document.getElementById('roomsList');
  if (!state.rooms.length) {
    wrap.innerHTML = '<div class="empty-state">Todavía no hay salas creadas.</div>';
    return;
  }
  const user = currentUser();
  wrap.innerHTML = state.rooms.slice().sort((a, b) => b.createdAt - a.createdAt).map(room => {
    const full = room.members.length >= MAX_PLAYERS;
    const near = room.members.length >= 10 && room.members.length < MAX_PLAYERS;
    const joined = room.members.includes(user.id);
    const waiting = room.waitlist.includes(user.id);
    const statusLabel = full ? 'Llena' : near ? 'Casi llena' : 'Abierta';
    const scheduleStatus = room.scheduleGenerated ? 'En juego' : room.pairsGenerated ? 'Parejas listas' : 'Preparación';
    return `
      <article class="room-card glass-lite">
        <div class="room-card-head wrap-mobile">
          <div>
            <strong>${escapeHtml(room.name)}</strong>
            <div class="meta-note">Código ${room.code} · Admin ${escapeHtml(getUsername(room.adminId))}</div>
          </div>
          <button class="btn ${joined ? 'btn-secondary' : full ? 'btn-warning' : 'btn-primary'} btn-small room-join-btn" data-room-id="${room.id}" type="button">${joined ? 'Entrar' : full ? 'Lista espera' : 'Unirme'}</button>
        </div>
        <div class="room-meta">
          <div class="meta-box"><strong>${room.members.length}/${MAX_PLAYERS}</strong><span>Plazas</span></div>
          <div class="meta-box"><strong>${room.waitlist.length}</strong><span>Espera</span></div>
          <div class="meta-box"><strong>${countCompletedMatches(room)}/${room.scheduleGenerated ? 12 : 0}</strong><span>Partidos</span></div>
        </div>
        <div class="room-state-tags">
          <span class="status-pill ${full ? 'full' : near ? 'near' : ''}">${statusLabel}</span>
          <span class="status-pill ${room.scheduleGenerated ? 'live' : ''}">${scheduleStatus}</span>
          ${waiting ? '<span class="chip">En espera</span>' : ''}
        </div>
      </article>`;
  }).join('');

  document.querySelectorAll('.room-join-btn').forEach(btn => btn.addEventListener('click', () => joinRoom(btn.dataset.roomId)));
}

function joinRoom(roomId) {
  const room = getRoom(roomId);
  const user = currentUser();
  if (!room || !user) return;
  const currentRoom = getUserRoom(user.id);
  if (currentRoom && currentRoom.id !== room.id) return toast('Primero sal de tu sala actual para entrar en otra.');
  if (room.members.includes(user.id)) return renderRoom(room.id);
  if (room.waitlist.includes(user.id)) return toast('Ya estás en la lista de espera.');

  if (room.members.length >= MAX_PLAYERS) {
    room.waitlist.push(user.id);
    addHistory(room, `${user.username} entra en lista de espera.`);
    notifyRoom(room, 'Sala llena', `${user.username} ha entrado en la lista de espera.`);
    saveState();
    renderLobby();
    return toast('Sala llena. Te hemos metido en la lista de espera.');
  }

  room.members.push(user.id);
  room.attendance[user.id] = true;
  addHistory(room, `${user.username} entra en la sala.`);
  notifyRoom(room, 'Nuevo jugador', `${user.username} se ha unido a ${room.name}.`);
  saveState();
  renderRoom(room.id);
  toast(`Has entrado en ${room.name}.`);
}

function renderRoom(roomId) {
  const room = getRoom(roomId);
  if (!room) return renderLobby();
  app.innerHTML = document.getElementById('roomTemplate').innerHTML;
  const user = currentUser();
  const isAdmin = room.adminId === user.id;

  document.getElementById('roomTitle').textContent = room.name;
  document.getElementById('roomMeta').textContent = `Código ${room.code} · Admin ${getUsername(room.adminId)} · ${room.members.length}/${MAX_PLAYERS} jugadores`;
  document.getElementById('copyCodeBtn').addEventListener('click', () => copyText(room.code, 'Código copiado.'));
  document.getElementById('shareSummaryBtn').addEventListener('click', () => copyText(buildRoomSummary(room), 'Resumen copiado.'));
  document.getElementById('backLobbyBtn').addEventListener('click', renderLobby);
  document.getElementById('leaveRoomBtn').addEventListener('click', () => leaveRoom(room.id));

  renderTopStats(room);
  renderPlayers(room, isAdmin);
  renderAttendance(room, isAdmin);
  renderWaitlist(room, isAdmin);
  renderAdminPanel(room, isAdmin);
  renderPairs(room);
  renderStandings(room);
  renderNextPending(room);
  renderMatches(room, isAdmin);
  renderHistory(room);
  renderChat(room);
  renderNotifications(room);
}

function renderTopStats(room) {
  const wrap = document.getElementById('roomTopStats');
  const confirmed = room.members.filter(id => room.attendance[id] !== false).length;
  const completed = countCompletedMatches(room);
  const leader = buildStandings(room)[0]?.name || '—';
  const pending = Math.max((room.scheduleGenerated ? 12 : 0) - completed, 0);
  wrap.innerHTML = `
    <div class="metric-card glass-lite"><strong>${confirmed}/${room.members.length}</strong><span>Asistencias OK</span></div>
    <div class="metric-card glass-lite"><strong>${completed}/${room.scheduleGenerated ? 12 : 0}</strong><span>Partidos jugados</span></div>
    <div class="metric-card glass-lite"><strong>${escapeHtml(leader)}</strong><span>Pareja líder</span></div>
    <div class="metric-card glass-lite"><strong>${pending}</strong><span>Partidos pendientes</span></div>`;
}

function renderPlayers(room, isAdmin) {
  const wrap = document.getElementById('playersGrid');
  const badge = document.getElementById('capacityBadge');
  badge.textContent = `${room.members.length}/${MAX_PLAYERS} plazas`;
  badge.className = `capacity-badge ${room.members.length >= MAX_PLAYERS ? 'full' : room.members.length >= 10 ? 'near' : ''}`;

  wrap.innerHTML = room.members.map(userId => {
    const profile = getUser(userId);
    return `
      <article class="player-chip ${room.adminId === userId ? 'admin' : ''}">
        <div class="chip-main">
          <div class="avatar">${getInitials(profile.username)}</div>
          <div>
            <strong>${escapeHtml(profile.username)}</strong>
            <div class="player-role">${room.adminId === userId ? 'Administrador' : getUser(userId).isGuest ? 'Jugador local' : 'Jugador'}</div>
          </div>
        </div>
        <div class="chip-row">
          ${room.attendance[userId] !== false ? '<span class="tiny-pill">Asiste</span>' : '<span class="status-pill near">Pendiente</span>'}
          ${isAdmin && userId !== currentUser().id ? `<button class="btn btn-ghost btn-small kick-btn" data-user-id="${userId}" type="button">Expulsar</button>` : ''}
        </div>
      </article>`;
  }).join('');

  if (isAdmin) {
    wrap.querySelectorAll('.kick-btn').forEach(btn => btn.addEventListener('click', () => removePlayer(room.id, btn.dataset.userId)));
  }
}

function renderAttendance(room, isAdmin) {
  const wrap = document.getElementById('attendanceCard');
  const current = currentUser();
  wrap.innerHTML = `
    <div class="section-title-row wrap-mobile">
      <h3>Asistencia</h3>
      <span class="subtle">Confirma antes de sortear parejas</span>
    </div>
    <div class="attendance-grid">
      ${room.members.map(userId => `
        <div class="waitlist-item">
          <strong>${escapeHtml(getUsername(userId))}</strong>
          <div class="meta-note">${room.attendance[userId] !== false ? 'Confirmado' : 'No confirmado'}</div>
          <div class="inline-actions" style="margin-top:10px;">
            ${userId === current.id ? `<button class="btn ${room.attendance[userId] !== false ? 'btn-warning' : 'btn-primary'} btn-small toggle-attendance-btn" data-user-id="${userId}" type="button">${room.attendance[userId] !== false ? 'Marcar no' : 'Confirmar'}</button>` : ''}
            ${isAdmin && userId !== current.id ? `<button class="btn btn-ghost btn-small force-attendance-btn" data-user-id="${userId}" type="button">Alternar</button>` : ''}
          </div>
        </div>`).join('')}
    </div>`;

  wrap.querySelectorAll('.toggle-attendance-btn, .force-attendance-btn').forEach(btn => btn.addEventListener('click', () => toggleAttendance(room.id, btn.dataset.userId)));
}

function renderWaitlist(room, isAdmin) {
  const wrap = document.getElementById('waitlistCard');
  if (!room.waitlist.length) {
    wrap.innerHTML = `
      <div class="section-title-row wrap-mobile">
        <h3>Lista de espera</h3>
        <span class="subtle">Sin jugadores pendientes</span>
      </div>
      <div class="empty-state">No hay nadie en lista de espera.</div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="section-title-row wrap-mobile">
      <h3>Lista de espera</h3>
      <span class="subtle">Suben automáticamente si se libera hueco</span>
    </div>
    <div class="waitlist-grid">
      ${room.waitlist.map((userId, index) => `
        <div class="waitlist-item">
          <strong>${index + 1}. ${escapeHtml(getUsername(userId))}</strong>
          <div class="meta-note">Esperando plaza</div>
          ${isAdmin ? `<div class="inline-actions" style="margin-top:10px;"><button class="btn btn-ghost btn-small promote-btn" data-user-id="${userId}" type="button">Promover</button></div>` : ''}
        </div>`).join('')}
    </div>`;

  if (isAdmin) {
    wrap.querySelectorAll('.promote-btn').forEach(btn => btn.addEventListener('click', () => promoteSpecificWaiter(room.id, btn.dataset.userId)));
  }
}

function renderAdminPanel(room, isAdmin) {
  const wrap = document.getElementById('adminPanel');
  if (!isAdmin) {
    wrap.innerHTML = '';
    return;
  }

  const canGeneratePairs = !room.pairsGenerated && room.members.length === MAX_PLAYERS && room.members.every(id => room.attendance[id] !== false);
  const canGenerateSchedule = room.pairsGenerated && !room.scheduleGenerated;
  const hasResults = room.rounds.some(round => round.matches.some(match => match.result));

  wrap.innerHTML = `
    <section class="card glass stack-md">
      <div class="section-title-row wrap-mobile">
        <h3>Panel de administrador</h3>
        <span class="subtle">Control total de la sala</span>
      </div>

      <div class="top-inline-grid">
        <div><strong>${room.settings.pairMode === 'balanced' ? 'Balanceado' : 'Aleatorio'}</strong><span>Modo parejas</span></div>
        <div><strong>${room.pairsGenerated ? 'Sí' : 'No'}</strong><span>Parejas generadas</span></div>
        <div><strong>${room.scheduleGenerated ? 'Sí' : 'No'}</strong><span>Calendario generado</span></div>
      </div>

      <div class="card glass-lite stack-md">
        <div class="section-title-row wrap-mobile">
          <h4>Añadir jugador manualmente</h4>
          <span class="subtle">${room.members.length < MAX_PLAYERS ? `${MAX_PLAYERS - room.members.length} plazas libres` : 'Sala completa'}</span>
        </div>
        <form id="manualPlayerForm" class="stack-md">
          <label>
            <span>Nombre del jugador</span>
            <input name="playerName" maxlength="20" placeholder="Ej. Rubén" ${room.members.length >= MAX_PLAYERS ? 'disabled' : ''}>
          </label>
          <button class="btn btn-primary" type="submit" ${room.members.length >= MAX_PLAYERS ? 'disabled' : ''}>Añadir jugador</button>
        </form>
        <div class="meta-note">El administrador puede meter jugadores sin que tengan cuenta. Se guardan solo en local para esta app.</div>
      </div>

      <div class="admin-panel-actions">
        <button id="pairModeBtn" class="btn btn-ghost" type="button">Cambiar a ${room.settings.pairMode === 'balanced' ? 'aleatorio' : 'balanceado'}</button>
        <button id="generatePairsBtn" class="btn btn-primary" type="button" ${canGeneratePairs ? '' : 'disabled'}>Generar 6 parejas</button>
        <button id="generateScheduleBtn" class="btn btn-secondary" type="button" ${canGenerateSchedule ? '' : 'disabled'}>Crear 4 jornadas</button>
        <button id="resetTournamentBtn" class="btn btn-warning" type="button" ${hasResults ? 'disabled' : ''}>Rehacer torneo</button>
        <button id="undoLastResultBtn" class="btn btn-ghost" type="button" ${room.lastResultMeta ? "" : "disabled"}>Deshacer último resultado</button>
      </div>

      <div class="card glass-lite stack-md">
        <h4>Cambiar administrador</h4>
        <div class="admin-tools-grid">
          ${room.members.filter(id => id !== room.adminId).map(userId => `
            <div class="tool-row">
              <div>
                <strong>${escapeHtml(getUsername(userId))}</strong>
                <div class="meta-note">Dar permisos de admin${getUser(userId).isGuest ? ' · jugador local' : ''}</div>
              </div>
              <button class="btn btn-ghost btn-small promote-admin-btn" data-user-id="${userId}" type="button">Hacer admin</button>
            </div>`).join('') || '<div class="empty-state">No hay otro jugador al que promocionar.</div>'}
        </div>
      </div>
    </section>`;

  const manualPlayerForm = document.getElementById('manualPlayerForm');
  if (manualPlayerForm) {
    manualPlayerForm.addEventListener('submit', event => {
      event.preventDefault();
      addManualPlayer(room.id, new FormData(manualPlayerForm).get('playerName'));
    });
  }
  document.getElementById('pairModeBtn').addEventListener('click', () => togglePairMode(room.id));
  document.getElementById('generatePairsBtn').addEventListener('click', () => generatePairs(room.id));
  document.getElementById('generateScheduleBtn').addEventListener('click', () => generateSchedule(room.id));
  document.getElementById('resetTournamentBtn').addEventListener('click', () => resetTournament(room.id));
  document.getElementById('undoLastResultBtn').addEventListener('click', () => undoLastResult(room.id));
  wrap.querySelectorAll('.promote-admin-btn').forEach(btn => btn.addEventListener('click', () => changeAdmin(room.id, btn.dataset.userId)));
}

function renderPairs(room) {
  const wrap = document.getElementById('pairsList');
  if (!room.pairsGenerated || !room.pairs.length) {
    wrap.innerHTML = '<div class="empty-state">Las parejas aparecerán cuando el admin genere el sorteo con 12 jugadores confirmados.</div>';
    return;
  }
  wrap.innerHTML = room.pairs.map((pair, index) => `
    <article class="pair-card">
      <div class="room-row wrap-mobile">
        <div>
          <strong>Pareja ${index + 1}</strong>
          <div class="meta-note">${pair.playerIds.map(getUsername).join(' + ')}</div>
        </div>
        <span class="tiny-pill">${average(pair.playerIds.map(getUserElo)).toFixed(0)} ELO medio</span>
      </div>
    </article>`).join('');
}


function renderStandings(room) {
  const podiumWrap = document.getElementById('standingsPodium');
  const tableWrap = document.getElementById('standingsTable');
  const standings = buildStandings(room);

  if (!room.pairsGenerated || !room.pairs.length) {
    podiumWrap.innerHTML = '';
    tableWrap.innerHTML = '<div class="empty-state">La clasificación por parejas aparecerá cuando generes las parejas.</div>';
    return;
  }

  const top3 = standings.slice(0, 3);
  podiumWrap.innerHTML = top3.length ? `<div class="podium pair-podium">${top3.map((item, idx) => `
    <div class="podium-card ${idx === 0 ? 'first' : idx === 1 ? 'second' : 'third'}">
      <div class="meta-note">#${idx + 1}</div>
      <strong>${escapeHtml(item.name)}</strong>
      <div>${item.points} pts</div>
      <small>${item.wins}V · ${item.draws}E · ${item.losses}D</small>
    </div>`).join('')}</div>` : '';

  tableWrap.innerHTML = `<div class="pair-standings-list mobile-clean-list">${standings.map((item, index) => `
    <article class="pair-standing-card ${index < 3 ? 'top' : ''}">
      <div class="pair-standing-rank">${index + 1}</div>
      <div class="pair-standing-main">
        <div class="pair-standing-name">${escapeHtml(item.name)}</div>
        <div class="pair-standing-chips">
          <span class="tiny-pill">${item.points} pts</span>
          <span class="tiny-pill">${item.played} PJ</span>
          <span class="tiny-pill">${item.wins}V</span>
          <span class="tiny-pill">${item.draws}E</span>
          <span class="tiny-pill">${item.losses}D</span>
        </div>
      </div>
      <div class="pair-standing-side compact">
        <span>Juegos: ${item.gamesWon}-${item.gamesLost}</span>
        <span>Dif: ${item.gamesDiff >= 0 ? '+' : ''}${item.gamesDiff}</span>
      </div>
    </article>`).join('')}</div>`;
}

function renderNextPending(room) {
  const wrap = document.getElementById('nextPendingWrap');
  if (!wrap) return;
  if (!room.scheduleGenerated) {
    wrap.innerHTML = '';
    return;
  }
  const next = room.rounds.flatMap(round => round.matches.map(match => ({ round: round.number, match }))).find(item => !item.match.result);
  if (!next) {
    wrap.innerHTML = '<div class="next-match-card glass-lite done"><strong>Todos los partidos tienen resultado.</strong><div class="meta-note">Puedes revisar la clasificación final o copiar el resumen.</div></div>';
    return;
  }
  const pairA = room.pairs.find(pair => pair.id === next.match.pairAId);
  const pairB = room.pairs.find(pair => pair.id === next.match.pairBId);
  wrap.innerHTML = `
    <div class="next-match-card glass-lite">
      <div>
        <div class="eyebrow">Nueva funcionalidad</div>
        <strong>Siguiente partido pendiente</strong>
        <div class="meta-note">Jornada ${next.round} · Pista ${next.match.court}</div>
        <div class="next-match-teams">${escapeHtml(pairA.playerIds.map(getUsername).join(' + '))} <span>vs</span> ${escapeHtml(pairB.playerIds.map(getUsername).join(' + '))}</div>
      </div>
      <button class="btn btn-primary btn-small" type="button" id="jumpNextMatchBtn">Ir al partido</button>
    </div>`;
  const btn = document.getElementById('jumpNextMatchBtn');
  if (btn) btn.addEventListener('click', () => {
    const target = document.querySelector(`[data-match-id="${next.match.id}"]`);
    if (target) target.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth', block: 'center' });
  });
}


function renderMatches(room, isAdmin) {
  const wrap = document.getElementById('matchesBoard');
  if (!room.scheduleGenerated) {
    wrap.innerHTML = '<div class="empty-state">Las jornadas aparecerán cuando el admin cree el calendario.</div>';
    return;
  }

  wrap.innerHTML = room.rounds.map(round => `
    <article class="round-card">
      <div class="round-title wrap-mobile">
        <div>
          <strong>Jornada ${round.number}</strong>
          <div class="meta-note">3 pistas simultáneas${round.mvp ? ` · MVP ${escapeHtml(round.mvp)}` : ''}</div>
        </div>
        <span class="tiny-pill">${round.matches.filter(match => match.result).length}/3 cerrados</span>
      </div>
      <div class="matches-grid">
        ${round.matches.map(match => {
          const pairA = room.pairs.find(pair => pair.id === match.pairAId);
          const pairB = room.pairs.find(pair => pair.id === match.pairBId);
          const resultText = match.result ? summarizeResult(match.result) : 'Pendiente';
          const drawClass = match.result && Number(match.result.a1) === Number(match.result.b1) ? 'draw' : '';
          return `
            <article class="match-card ${match.result ? 'done' : ''} ${drawClass}">
              <div class="match-line wrap-mobile">
                <div>
                  <strong>Pista ${match.court}</strong>
                  <div class="meta-note">${escapeHtml(pairA.playerIds.map(getUsername).join(' + '))} vs ${escapeHtml(pairB.playerIds.map(getUsername).join(' + '))}</div>
                </div>
                <span class="result-badge ${drawClass}">${escapeHtml(resultText)}</span>
              </div>
              ${isAdmin ? `
                <form class="score-form score-form-single-set" data-match-id="${match.id}">
                  <div class="score-sheet-single cleaner-mobile-score">
                    <div class="single-set-chip">1 set libre · se permite empate</div>
                    <div class="score-stack-team team-a">
                      <div class="score-team-label">Pareja 1</div>
                      <div class="score-team-name">${escapeHtml(pairA.playerIds.map(getUsername).join(' + '))}</div>
                      <div class="quick-score-grid">
                        <button class="quick-step" type="button" data-score-adjust="-1" data-score-target="a1">−</button>
                        <input name="a1" inputmode="numeric" min="0" aria-label="Juegos de ${pairA.playerIds.map(getUsername).join(' y ')}" placeholder="0" value="${valueForInput(match.result?.a1)}">
                        <button class="quick-step" type="button" data-score-adjust="1" data-score-target="a1">+</button>
                      </div>
                      <div class="preset-row">
                        ${[4,5,6,7,10].map(v => `<button class="preset-score-btn" type="button" data-score-value="${v}" data-score-target="a1">${v}</button>`).join('')}
                      </div>
                    </div>
                    <div class="score-vs big">VS</div>
                    <div class="score-stack-team team-b">
                      <div class="score-team-label">Pareja 2</div>
                      <div class="score-team-name">${escapeHtml(pairB.playerIds.map(getUsername).join(' + '))}</div>
                      <div class="quick-score-grid">
                        <button class="quick-step" type="button" data-score-adjust="-1" data-score-target="b1">−</button>
                        <input name="b1" inputmode="numeric" min="0" aria-label="Juegos de ${pairB.playerIds.map(getUsername).join(' y ')}" placeholder="0" value="${valueForInput(match.result?.b1)}">
                        <button class="quick-step" type="button" data-score-adjust="1" data-score-target="b1">+</button>
                      </div>
                      <div class="preset-row">
                        ${[4,5,6,7,10].map(v => `<button class="preset-score-btn" type="button" data-score-value="${v}" data-score-target="b1">${v}</button>`).join('')}
                      </div>
                    </div>
                  </div>
                  <div class="meta-note">Puedes escribir cualquier número de juegos y también dejar empate, por ejemplo 5-5.</div>
                  <div class="inline-actions sticky-actions-mobile">
                    <button class="btn btn-primary btn-small" type="submit">Guardar resultado</button>
                    ${match.result ? `<button class="btn btn-ghost btn-small clear-score-btn" data-match-id="${match.id}" type="button">Borrar</button>` : ''}
                  </div>
                </form>` : ''}
            </article>`;
        }).join('')}
      </div>
    </article>`).join('');

  if (isAdmin) {
    wrap.querySelectorAll('.score-form').forEach(form => form.addEventListener('submit', event => {
      event.preventDefault();
      saveMatchResult(room.id, form.dataset.matchId, new FormData(form));
    }));
    wrap.querySelectorAll('.clear-score-btn').forEach(btn => btn.addEventListener('click', () => clearMatchResult(room.id, btn.dataset.matchId)));
    wrap.querySelectorAll('.quick-step').forEach(btn => btn.addEventListener('click', () => adjustScoreInput(btn)));
    wrap.querySelectorAll('.preset-score-btn').forEach(btn => btn.addEventListener('click', () => setScoreInput(btn)));
  }
}


function adjustScoreInput(button) {
  const form = button.closest('form');
  const input = form?.querySelector(`input[name="${button.dataset.scoreTarget}"]`);
  if (!input) return;
  const current = Number(input.value || 0);
  const next = Math.max(0, current + Number(button.dataset.scoreAdjust || 0));
  input.value = String(next);
}

function setScoreInput(button) {
  const form = button.closest('form');
  const input = form?.querySelector(`input[name="${button.dataset.scoreTarget}"]`);
  if (!input) return;
  input.value = button.dataset.scoreValue || '0';
}

function renderHistory(room) {
  const wrap = document.getElementById('historyFeed');
  const items = room.history.slice().reverse().slice(0, 18);
  wrap.innerHTML = items.length ? items.map(item => `
    <div class="history-item">
      <div class="history-dot"></div>
      <div><strong>${escapeHtml(item.text)}</strong><br><small>${formatDate(item.at)}</small></div>
    </div>`).join('') : '<div class="empty-state">Aún no hay actividad registrada.</div>';
}

function renderChat(room) {
  const feed = document.getElementById('chatMessages');
  const form = document.getElementById('chatForm');
  const current = currentUser();
  feed.innerHTML = room.chat.length ? room.chat.slice(-30).map(msg => `
    <div class="chat-msg ${msg.userId === current.id ? 'mine' : ''}">
      <strong>${escapeHtml(getUsername(msg.userId))}</strong>
      <p>${escapeHtml(msg.text)}</p>
      <small>${formatDate(msg.at)}</small>
    </div>`).join('') : '<div class="empty-state">Todavía no hay mensajes en la sala.</div>';
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = String(new FormData(form).get('message') || '').trim();
    if (!text) return;
    room.chat.push({ id: uid('msg'), userId: current.id, text: text.slice(0, 180), at: Date.now() });
    addHistory(room, `${current.username} ha enviado un mensaje al chat.`);
    saveState();
    renderRoom(room.id);
  });
}

function renderNotifications(room) {
  const wrap = document.getElementById('notificationsFeed');
  const items = room.notifications.slice().reverse().slice(0, 14);
  wrap.innerHTML = items.length ? items.map(item => `
    <div class="history-item">
      <div class="history-dot pulse"></div>
      <div><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.text)} · ${formatDate(item.at)}</small></div>
    </div>`).join('') : '<div class="empty-state">Sin avisos todavía.</div>';
}

function toggleAttendance(roomId, userId) {
  const room = getRoom(roomId);
  if (!room) return;
  room.attendance[userId] = room.attendance[userId] === false;
  addHistory(room, `${getUsername(userId)} ${room.attendance[userId] ? 'confirma' : 'marca'} asistencia.`);
  saveState();
  renderRoom(room.id);
}

function addManualPlayer(roomId, rawName) {
  const room = getRoom(roomId);
  const admin = currentUser();
  if (!room || !admin || room.adminId !== admin.id) return;
  if (room.members.length >= MAX_PLAYERS) return toast('La sala ya está completa.');

  const playerName = normalizeUsername(rawName);
  if (playerName.length < 2) return toast('Escribe un nombre válido para el jugador.');
  if (room.members.some(userId => getUsername(userId).toLowerCase() === playerName.toLowerCase())) {
    return toast('Ya existe un jugador con ese nombre dentro de esta sala.');
  }

  const existingUser = state.users.find(user => (
    user.username.toLowerCase() === playerName.toLowerCase() &&
    !getUserRoom(user.id) &&
    !room.waitlist.includes(user.id)
  ));

  const user = existingUser || sanitizeUser({
    id: uid('guest'),
    username: playerName,
    password: '',
    elo: 1000,
    createdAt: Date.now(),
    stats: sanitizeStats(),
    achievements: [],
    isGuest: true
  });

  if (!existingUser) state.users.push(user);

  room.members.push(user.id);
  room.attendance[user.id] = true;

  if (room.pairsGenerated || room.scheduleGenerated) {
    room.pairs = [];
    room.rounds = [];
    room.pairsGenerated = false;
    room.scheduleGenerated = false;
    room.resultAudit = {};
    room.lastResultMeta = null;
    addHistory(room, 'Torneo reiniciado por cambio de participantes.');
    notifyRoom(room, 'Torneo reiniciado', 'Se han borrado parejas y jornadas para mantener la consistencia.');
  }

  addHistory(room, `${playerName} ha sido añadido manualmente por el administrador.`);
  notifyRoom(room, 'Jugador añadido', `${playerName} entra en la sala.`);
  saveState();
  renderRoom(room.id);
  toast(`${playerName} añadido correctamente.`);
}

function removePlayer(roomId, userId) {
  const room = getRoom(roomId);
  if (!room) return;
  const targetName = getUsername(userId);
  room.members = room.members.filter(id => id !== userId);
  room.waitlist = room.waitlist.filter(id => id !== userId);
  delete room.attendance[userId];
  if (room.adminId === userId && room.members.length) room.adminId = room.members[0];
  if (room.members.length < MAX_PLAYERS) promoteFromWaitlist(room);
  addHistory(room, `${targetName} ha sido expulsado de la sala.`);
  notifyRoom(room, 'Jugador expulsado', `${targetName} ha salido de la sala.`);
  if (!room.members.length) {
    state.rooms = state.rooms.filter(item => item.id !== room.id);
    saveState();
    toast('La sala se ha eliminado porque se quedó vacía.');
    return renderLobby();
  }
  if (room.pairsGenerated) {
    room.pairsGenerated = false;
    room.scheduleGenerated = false;
    room.pairs = [];
    room.rounds = [];
    room.resultAudit = {};
    addHistory(room, 'Torneo reiniciado automáticamente por cambio de participantes.');
  }
  saveState();
  renderRoom(room.id);
}

function leaveRoom(roomId) {
  const room = getRoom(roomId);
  const user = currentUser();
  if (!room || !user) return;
  room.members = room.members.filter(id => id !== user.id);
  room.waitlist = room.waitlist.filter(id => id !== user.id);
  delete room.attendance[user.id];
  if (room.adminId === user.id && room.members.length) room.adminId = room.members[0];
  addHistory(room, `${user.username} ha salido de la sala.`);
  notifyRoom(room, 'Jugador sale', `${user.username} ha abandonado la sala.`);
  promoteFromWaitlist(room);
  if (!room.members.length) {
    state.rooms = state.rooms.filter(item => item.id !== room.id);
    saveState();
    toast('Sala eliminada al quedarse vacía.');
  } else {
    if (room.pairsGenerated) {
      room.pairsGenerated = false;
      room.scheduleGenerated = false;
      room.pairs = [];
      room.rounds = [];
      room.resultAudit = {};
      addHistory(room, 'Torneo reiniciado por cambio de participantes.');
    }
    saveState();
    toast('Has salido de la sala.');
  }
  render();
}

function promoteFromWaitlist(room) {
  if (room.members.length >= MAX_PLAYERS || !room.waitlist.length) return;
  const nextId = room.waitlist.shift();
  room.members.push(nextId);
  room.attendance[nextId] = true;
  addHistory(room, `${getUsername(nextId)} sube desde la lista de espera.`);
  notifyRoom(room, 'Plaza liberada', `${getUsername(nextId)} entra desde la lista de espera.`);
}

function promoteSpecificWaiter(roomId, userId) {
  const room = getRoom(roomId);
  if (!room) return;
  if (room.members.length >= MAX_PLAYERS) return toast('No hay hueco para promocionar a nadie ahora mismo.');
  room.waitlist = room.waitlist.filter(id => id !== userId);
  room.members.push(userId);
  room.attendance[userId] = true;
  addHistory(room, `${getUsername(userId)} entra manualmente desde la lista de espera.`);
  notifyRoom(room, 'Promoción manual', `${getUsername(userId)} ha sido promovido a la sala.`);
  saveState();
  renderRoom(room.id);
}

function togglePairMode(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  room.settings.pairMode = room.settings.pairMode === 'balanced' ? 'random' : 'balanced';
  addHistory(room, `Modo de parejas cambiado a ${room.settings.pairMode === 'balanced' ? 'balanceado' : 'aleatorio'}.`);
  saveState();
  renderRoom(room.id);
}

function generatePairs(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  if (room.pairsGenerated) return toast('Las parejas ya se generaron.');
  if (room.members.length !== MAX_PLAYERS) return toast('Necesitas 12 jugadores exactos para generar parejas.');
  if (room.members.some(id => room.attendance[id] === false)) return toast('Todos los jugadores deben confirmar asistencia.');

  const players = room.members.map(userId => ({ userId, elo: getUserElo(userId) }));
  let pairs = [];
  if (room.settings.pairMode === 'balanced') {
    const sorted = players.slice().sort((a, b) => b.elo - a.elo);
    const low = sorted.slice(Math.ceil(sorted.length / 2)).reverse();
    const high = sorted.slice(0, Math.ceil(sorted.length / 2));
    pairs = high.map((item, index) => ({ id: uid('pair'), playerIds: [item.userId, low[index]?.userId].filter(Boolean) }));
    shuffle(pairs);
  } else {
    const shuffled = shuffle(players.map(item => item.userId));
    for (let i = 0; i < shuffled.length; i += 2) pairs.push({ id: uid('pair'), playerIds: [shuffled[i], shuffled[i + 1]] });
  }

  if (pairs.some(pair => pair.playerIds.length !== 2) || pairs.length !== MAX_PAIRS) return toast('No se han podido generar las 6 parejas correctamente.');
  room.pairs = pairs;
  room.pairsGenerated = true;
  addHistory(room, `Se han generado las parejas en modo ${room.settings.pairMode === 'balanced' ? 'balanceado' : 'aleatorio'}.`);
  notifyRoom(room, 'Parejas creadas', 'Ya están listas las 6 parejas de la sala.');
  saveState();
  renderRoom(room.id);
  toast('Parejas creadas correctamente.');
}

function generateSchedule(roomId) {
  const room = getRoom(roomId);
  if (!room || !room.pairsGenerated) return toast('Primero debes generar las parejas.');
  if (room.scheduleGenerated) return toast('Las jornadas ya están creadas.');
  const pairIds = room.pairs.map(pair => pair.id);
  if (pairIds.length !== MAX_PAIRS) return toast('Faltan parejas válidas.');

  const roundsBase = generateRoundRobin(pairIds);
  if (roundsBase.length < ROUNDS_TO_PLAY) return toast('No se han podido crear suficientes jornadas.');

  room.rounds = roundsBase.slice(0, ROUNDS_TO_PLAY).map((matches, index) => ({
    number: index + 1,
    matches: matches.map((pairing, courtIndex) => ({ id: uid('match'), court: courtIndex + 1, pairAId: pairing[0], pairBId: pairing[1], result: null })),
    mvp: ''
  }));
  room.scheduleGenerated = true;
  addHistory(room, 'Se han creado las 4 jornadas automáticas.');
  notifyRoom(room, 'Calendario listo', 'Ya están creadas las 4 jornadas con 3 pistas.');
  saveState();
  renderRoom(room.id);
  toast('Jornadas creadas correctamente.');
}

function resetTournament(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  const hasResults = room.rounds.some(round => round.matches.some(match => match.result));
  if (hasResults) return toast('No puedes rehacer el torneo después de meter resultados.');
  room.pairs = [];
  room.rounds = [];
  room.pairsGenerated = false;
  room.scheduleGenerated = false;
  room.resultAudit = {};
  room.lastResultMeta = null;
  addHistory(room, 'El administrador ha rehecho el torneo antes de iniciar resultados.');
  notifyRoom(room, 'Torneo rehecho', 'Se han borrado parejas y jornadas para volver a empezar.');
  saveState();
  renderRoom(room.id);
  toast('Torneo reiniciado.');
}

function changeAdmin(roomId, userId) {
  const room = getRoom(roomId);
  if (!room || !room.members.includes(userId)) return;
  room.adminId = userId;
  addHistory(room, `${getUsername(userId)} es ahora administrador de la sala.`);
  notifyRoom(room, 'Nuevo administrador', `${getUsername(userId)} tiene el control de la sala.`);
  saveState();
  renderRoom(room.id);
}

function saveMatchResult(roomId, matchId, formData) {
  const room = getRoom(roomId);
  if (!room) return;
  const match = findMatch(room, matchId);
  if (!match) return;
  const previousResult = match.result ? sanitizeResult(match.result) : null;
  const result = sanitizeResult({
    a1: String(formData.get('a1') || '').trim() === '' ? '' : Number(formData.get('a1')),
    b1: String(formData.get('b1') || '').trim() === '' ? '' : Number(formData.get('b1'))
  });

  if (!isValidMatchResult(result)) return toast('Introduce los juegos de ambas parejas.');

  if (previousResult) rollbackMatchImpact(room, match);
  match.result = result;
  applyMatchImpact(room, match, result);
  updateRoomMvps(room);
  room.lastResultMeta = { matchId: match.id, savedAt: Date.now() };
  addHistory(room, `Resultado guardado en jornada ${findRoundNumber(room, match.id)} pista ${match.court}: ${summarizeResult(result)}.`);
  notifyRoom(room, 'Resultado actualizado', `Se ha cerrado un partido de la jornada ${findRoundNumber(room, match.id)}.`);
  saveState();
  renderRoom(room.id);
  toast('Resultado guardado.');
}

function clearMatchResult(roomId, matchId) {
  const room = getRoom(roomId);
  if (!room) return;
  const match = findMatch(room, matchId);
  if (!match || !match.result) return;
  rollbackMatchImpact(room, match);
  match.result = null;
  updateRoomMvps(room);
  if (room.lastResultMeta?.matchId === match.id) room.lastResultMeta = null;
  addHistory(room, `Resultado eliminado en jornada ${findRoundNumber(room, match.id)} pista ${match.court}.`);
  notifyRoom(room, 'Resultado borrado', 'Un partido ha vuelto a quedar pendiente.');
  saveState();
  renderRoom(room.id);
  toast('Resultado borrado.');
}


function isValidMatchResult(result) {
  if (result.a1 === '' || result.b1 === '') return false;
  if (!Number.isFinite(Number(result.a1)) || !Number.isFinite(Number(result.b1))) return false;
  return Number(result.a1) >= 0 && Number(result.b1) >= 0;
}



function applyMatchImpact(room, match, result) {
  const pairA = room.pairs.find(pair => pair.id === match.pairAId);
  const pairB = room.pairs.find(pair => pair.id === match.pairBId);
  const { setsA, setsB, gamesA, gamesB } = countSets(result);
  const winner = gamesA === gamesB ? null : (gamesA > gamesB ? 'A' : 'B');
  const avgA = average(pairA.playerIds.map(getUserElo));
  const avgB = average(pairB.playerIds.map(getUserElo));
  const expectedA = 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
  const expectedB = 1 - expectedA;
  const scoreA = winner === null ? 0.5 : (winner === 'A' ? 1 : 0);
  const scoreB = winner === null ? 0.5 : (winner === 'B' ? 1 : 0);
  const deltaA = Math.round(24 * (scoreA - expectedA));
  const deltaB = Math.round(24 * (scoreB - expectedB));
  const audit = { users: {} };

  const updatePlayer = (userId, outcome, setsWon, setsLost, gamesWon, gamesLost, delta, partnerId) => {
    const user = getUser(userId);
    user.elo += delta;
    user.stats.played += 1;
    user.stats.wins += outcome === 'W' ? 1 : 0;
    user.stats.losses += outcome === 'L' ? 1 : 0;
    user.stats.setsWon += setsWon;
    user.stats.setsLost += setsLost;
    user.stats.gamesWon += gamesWon;
    user.stats.gamesLost += gamesLost;
    user.stats.recent.push(outcome);
    user.stats.recent = user.stats.recent.slice(-10);
    user.stats.bestPartnerCount[partnerId] = (user.stats.bestPartnerCount[partnerId] || 0) + 1;
    audit.users[userId] = { outcome, setsWon, setsLost, gamesWon, gamesLost, delta, partnerId };
  };

  const outcomeA = winner === null ? 'D' : (winner === 'A' ? 'W' : 'L');
  const outcomeB = winner === null ? 'D' : (winner === 'B' ? 'W' : 'L');
  pairA.playerIds.forEach(userId => updatePlayer(userId, outcomeA, setsA, setsB, gamesA, gamesB, deltaA, pairA.playerIds.find(id => id !== userId)));
  pairB.playerIds.forEach(userId => updatePlayer(userId, outcomeB, setsB, setsA, gamesB, gamesA, deltaB, pairB.playerIds.find(id => id !== userId)));
  room.resultAudit[match.id] = audit;
  refreshAchievements(room);
}

function rollbackMatchImpact(room, match) {
  const audit = room.resultAudit[match.id];
  if (!audit?.users) return;
  Object.entries(audit.users).forEach(([userId, info]) => {
    const user = getUser(userId);
    user.elo -= info.delta;
    user.stats.played = Math.max(0, user.stats.played - 1);
    user.stats.wins = Math.max(0, user.stats.wins - (info.outcome === 'W' ? 1 : 0));
    user.stats.losses = Math.max(0, user.stats.losses - (info.outcome === 'L' ? 1 : 0));
    user.stats.setsWon = Math.max(0, user.stats.setsWon - info.setsWon);
    user.stats.setsLost = Math.max(0, user.stats.setsLost - info.setsLost);
    user.stats.gamesWon = Math.max(0, user.stats.gamesWon - info.gamesWon);
    user.stats.gamesLost = Math.max(0, user.stats.gamesLost - info.gamesLost);
    const target = info.outcome || 'D';
    const index = user.stats.recent.lastIndexOf(target);
    if (index !== -1) user.stats.recent.splice(index, 1);
    if (user.stats.bestPartnerCount[info.partnerId]) {
      user.stats.bestPartnerCount[info.partnerId] -= 1;
      if (user.stats.bestPartnerCount[info.partnerId] <= 0) delete user.stats.bestPartnerCount[info.partnerId];
    }
  });
  delete room.resultAudit[match.id];
  refreshAchievements(room);
}

function updateRoomMvps(room) {
  room.rounds.forEach(round => {
    const tally = {};
    round.matches.forEach(match => {
      if (!match.result) return;
      const pairA = room.pairs.find(pair => pair.id === match.pairAId);
      const pairB = room.pairs.find(pair => pair.id === match.pairBId);
      const { setsA, setsB, gamesA, gamesB } = countSets(match.result);
      if (gamesA === gamesB) {
        [...pairA.playerIds, ...pairB.playerIds].forEach(playerId => { tally[playerId] = (tally[playerId] || 0) + 5 + gamesA; });
      } else {
        const winnerPair = gamesA > gamesB ? pairA : pairB;
        const winnerGames = gamesA > gamesB ? gamesA : gamesB;
        winnerPair.playerIds.forEach(playerId => { tally[playerId] = (tally[playerId] || 0) + 10 + winnerGames; });
      }
    });
    const bestId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    round.mvp = bestId ? getUsername(bestId) : '';
  });
}

function refreshAchievements(room) {
  room.members.forEach(userId => {
    const user = getUser(userId);
    const achievements = new Set();
    const stats = user.stats;
    if (stats.wins >= 1) achievements.add('first_win');
    if (stats.wins >= 3) achievements.add('three_wins');
    if (stats.recent.slice(-3).join('') === 'WWW') achievements.add('streak3');
    if (stats.gamesWon >= 100) achievements.add('hundred_games');

    const roomEntries = collectRoomEntriesForUser(room, userId);
    if (roomEntries.length && roomEntries.every(entry => entry.won)) achievements.add('perfect_day');

    user.achievements = [...achievements];
  });
}

function collectRoomEntriesForUser(room, userId) {
  const entries = [];
  room.rounds.forEach(round => round.matches.forEach(match => {
    if (!match.result) return;
    const pairA = room.pairs.find(pair => pair.id === match.pairAId);
    const pairB = room.pairs.find(pair => pair.id === match.pairBId);
    const winner = getWinnerFromResult(match.result);
    if (pairA.playerIds.includes(userId)) entries.push({ won: winner === 'A' });
    if (pairB.playerIds.includes(userId)) entries.push({ won: winner === 'B' });
  }));
  return entries;
}


function buildStandings(room) {
  if (!room.pairsGenerated || !room.pairs.length) return [];
  const rows = room.pairs.map(pair => ({
    pairId: pair.id,
    name: pair.playerIds.map(getUsername).join(' y '),
    played: 0,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDiff: 0
  }));
  const map = Object.fromEntries(rows.map(row => [row.pairId, row]));

  room.rounds.forEach(round => round.matches.forEach(match => {
    if (!match.result) return;
    const rowA = map[match.pairAId];
    const rowB = map[match.pairBId];
    if (!rowA || !rowB) return;
    const { setsA, setsB, gamesA, gamesB } = countSets(match.result);
    rowA.played += 1; rowB.played += 1;
    rowA.setsWon += setsA; rowA.setsLost += setsB;
    rowB.setsWon += setsB; rowB.setsLost += setsA;
    rowA.gamesWon += gamesA; rowA.gamesLost += gamesB;
    rowB.gamesWon += gamesB; rowB.gamesLost += gamesA;
    if (gamesA > gamesB) {
      rowA.wins += 1; rowA.points += 3;
      rowB.losses += 1;
    } else if (gamesB > gamesA) {
      rowB.wins += 1; rowB.points += 3;
      rowA.losses += 1;
    } else {
      rowA.draws += 1; rowB.draws += 1;
      rowA.points += 1; rowB.points += 1;
    }
  }));

  rows.forEach(row => { row.gamesDiff = row.gamesWon - row.gamesLost; });

  return rows.sort((a, b) => (
    b.points - a.points ||
    b.gamesDiff - a.gamesDiff ||
    b.gamesWon - a.gamesWon ||
    b.wins - a.wins ||
    a.name.localeCompare(b.name)
  ));
}

function getComputedUserStats(userId, room) {
  const user = getUser(userId);
  const stats = user.stats;
  const bestPartnerId = Object.entries(stats.bestPartnerCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const level = getLevel(user.elo);
  const levelProgress = getLevelProgress(user.elo);
  return {
    userId,
    name: user.username,
    played: stats.played,
    wins: stats.wins,
    losses: stats.losses,
    setsWon: stats.setsWon,
    setsLost: stats.setsLost,
    gamesWon: stats.gamesWon,
    gamesLost: stats.gamesLost,
    gamesDiff: stats.gamesWon - stats.gamesLost,
    bestPartner: bestPartnerId ? getUsername(bestPartnerId) : '',
    winRate,
    elo: user.elo,
    level,
    levelProgress,
    streak: computeStreak(stats.recent),
    achievementIds: user.achievements || []
  };
}

function computeStreak(recent) {
  if (!recent.length) return 'Sin partidos';
  const last = recent[recent.length - 1];
  let count = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] !== last) break;
    count += 1;
  }
  return `${count}${last === 'W' ? ' victorias' : last === 'L' ? ' derrotas' : ' empates'} seguidos`;
}

function getLevel(elo) {
  return LEVELS.filter(level => elo >= level.min).at(-1)?.name || 'Bronce';
}

function getLevelProgress(elo) {
  const currentIndex = LEVELS.findIndex((level, index) => elo >= level.min && (!LEVELS[index + 1] || elo < LEVELS[index + 1].min));
  const current = LEVELS[currentIndex] || LEVELS[0];
  const next = LEVELS[currentIndex + 1];
  if (!next) return 100;
  return clamp(Math.round(((elo - current.min) / (next.min - current.min)) * 100), 0, 100);
}

function buildRoomSummary(room) {
  const standings = buildStandings(room).slice(0, 3).map((item, index) => `${index + 1}. ${item.name} (${item.points} pts)`).join(' | ') || 'Sin clasificación aún';
  return `${room.name} · Código ${room.code}\nJugadores: ${room.members.length}/${MAX_PLAYERS}\nFormato: 1 set libre con empate · Parejas: ${room.pairsGenerated ? 'Sí' : 'No'} · Jornadas: ${room.scheduleGenerated ? 'Sí' : 'No'}\nClasificación parejas: ${standings}`;
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'padelflow-ultra-backup.json';
  anchor.click();
  URL.revokeObjectURL(url);
  toast('Datos exportados.');
}

async function importStateFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = sanitizeState(JSON.parse(text));
    state.users.splice(0, state.users.length, ...imported.users);
    state.rooms.splice(0, state.rooms.length, ...imported.rooms);
    saveState();
    toast('Datos importados correctamente.');
    render();
  } catch {
    toast('No se pudo importar el archivo.');
  } finally {
    event.target.value = '';
  }
}

function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SESSION_KEY);
  state.users.splice(0, state.users.length);
  state.rooms.splice(0, state.rooms.length);
  toast('App reiniciada.');
  render();
}

function seedDemoData() {
  const existing = currentUser();
  state.rooms = state.rooms.filter(room => room.name !== 'Demo PadelFlow');
  const demoNames = ['Ana', 'Bruno', 'Carla', 'Dani', 'Elena', 'Ferran', 'Gisela', 'Hugo', 'Irene', 'Javi', 'Karen', 'Luis'];
  demoNames.forEach((name, index) => {
    if (!state.users.some(user => user.username.toLowerCase() === name.toLowerCase())) {
      state.users.push(sanitizeUser({ id: uid('user'), username: name, password: '1234', elo: 960 + index * 18, createdAt: Date.now() - index * 1000 }));
    }
  });
  const user = existing || state.users[0];
  if (!existing) setSession(user.id);

  const room = createRoom('Demo PadelFlow', user.id);
  state.users.filter(player => player.id !== user.id).slice(0, 11).forEach(player => {
    room.members.push(player.id);
    room.attendance[player.id] = true;
  });
  room.members = room.members.slice(0, 12);
  room.settings.pairMode = 'balanced';
  generatePairs(room.id);
  generateSchedule(room.id);

  const sampleResults = [
    [6,3], [4,6], [6,2],
    [7,5], [6,4], [3,6],
    [6,1], [6,4], [2,6],
    [6,4], [4,6], [6,0]
  ];

  room.rounds.flatMap(round => round.matches).forEach((match, index) => {
    const [a1, b1] = sampleResults[index];
    saveMatchResult(room.id, match.id, new Map([['a1', a1], ['b1', b1]]));
  });

  room.chat.push({ id: uid('msg'), userId: room.members[0], text: 'Bienvenidos a la demo 🚀', at: Date.now() });
  saveState();
  toast('Demo cargada.');
  renderRoom(room.id);
}

function generateRoomCode() {
  let code;
  do {
    code = `PF${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  } while (state.rooms.some(room => room.code === code));
  return code;
}

function generateRoundRobin(teams) {
  const list = [...teams];
  if (list.length % 2 !== 0) list.push(null);
  const rounds = [];
  for (let round = 0; round < list.length - 1; round += 1) {
    const matches = [];
    for (let i = 0; i < list.length / 2; i += 1) {
      const home = list[i];
      const away = list[list.length - 1 - i];
      if (home && away) matches.push([home, away]);
    }
    rounds.push(matches);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}


function undoLastResult(roomId) {
  const room = getRoom(roomId);
  if (!room?.lastResultMeta?.matchId) return toast('No hay ningún resultado reciente que deshacer.');
  clearMatchResult(room.id, room.lastResultMeta.matchId);
}

function countSets(result) {
  const a = result.a1 === '' ? 0 : Number(result.a1);
  const b = result.b1 === '' ? 0 : Number(result.b1);
  return {
    setsA: a > b ? 1 : 0,
    setsB: b > a ? 1 : 0,
    gamesA: a,
    gamesB: b
  };
}

function getWinnerFromResult(result) {
  const { gamesA, gamesB } = countSets(result);
  if (gamesA === gamesB) return null;
  return gamesA > gamesB ? 'A' : 'B';
}


function summarizeResult(result) {
  if (result.a1 === '' || result.b1 === '') return 'Pendiente';
  return Number(result.a1) === Number(result.b1) ? `${result.a1}-${result.b1} · empate` : `${result.a1}-${result.b1}`;
}


function countCompletedMatches(room) {
  return room.rounds.flatMap(round => round.matches).filter(match => match.result).length;
}

function findRoundNumber(room, matchId) {
  return room.rounds.find(round => round.matches.some(match => match.id === matchId))?.number || '-';
}

function findMatch(room, matchId) {
  return room.rounds.flatMap(round => round.matches).find(match => match.id === matchId) || null;
}

function getRoom(roomId) {
  return state.rooms.find(room => room.id === roomId) || null;
}

function getUserRoom(userId) {
  return state.rooms.find(room => room.members.includes(userId)) || null;
}

function getUser(userId) {
  return state.users.find(user => user.id === userId) || sanitizeUser({ id: userId, username: 'Jugador', password: '' });
}

function getUsername(userId) {
  return getUser(userId).username;
}

function getUserElo(userId) {
  return getUser(userId).elo || 1000;
}

function addHistory(room, text) {
  room.history.push({ id: uid('h'), text, at: Date.now() });
  room.history = room.history.slice(-100);
}

function notifyRoom(room, title, text) {
  room.notifications.push({ id: uid('n'), title, text, at: Date.now() });
  room.notifications = room.notifications.slice(-50);
}

function valueForInput(value) {
  return value === '' || value === undefined || value === null ? '' : String(value);
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function average(array) {
  return array.reduce((sum, value) => sum + Number(value || 0), 0) / (array.length || 1);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getInitials(name) {
  return String(name).split(' ').slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'J';
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    toast('No se pudo copiar automáticamente.');
  }
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  toastContainer.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}
