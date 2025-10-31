// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAgmLWiIGIFcxG7OIu_SIlKn6WAkrdVrs",
  authDomain: "iniciativadnd.firebaseapp.com",
  databaseURL: "https://iniciativadnd-default-rtdb.firebaseio.com",
  projectId: "iniciativadnd",
  storageBucket: "iniciativadnd.firebasestorage.app",
  messagingSenderId: "639360670200",
  appId: "1:639360670200:web:0861ccb49cf9a522135e0"
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (error) {
  console.error("Error inicializando Firebase:", error);
}
const db = firebase.database();

// --- VARIABLES GLOBALES ---
let roomId = null;
let playerId = null;
let isDM = false;
let combatListener = null;
let modalTarget = { charId: null, currentHp: 0 };

// --- FUNCIONES DE UTILIDAD ---
function generateId() { return Math.random().toString(36).substr(2, 9); }
function updateRoomCodeDisplay() { document.getElementById('roomCodeDisplay').textContent = roomId; document.getElementById('combatRoomCode').textContent = roomId; }
function copyRoomCode() { navigator.clipboard.writeText(roomId).then(() => alert('Código copiado: ' + roomId)); }
function cleanupListeners() { if (combatListener && roomId) db.ref(`rooms/${roomId}`).off("value", combatListener); combatListener = null; }

function backToMenu() {
  cleanupListeners();
  roomId = null;
  isDM = false;
  document.getElementById("combatView").style.display = "none";
  document.getElementById("playerSetup").style.display = "none";
  document.getElementById("createOrJoin").style.display = "block";
  checkForExistingSession();
}

// --- LÓGICA DE SESIÓN Y PREFERENCIAS ---
function savePlayerPreferences(name, maxHp, currentHp, showHelper) {
  localStorage.setItem('dnd_playerName', name);
  localStorage.setItem('dnd_playerMaxHp', maxHp);
  localStorage.setItem('dnd_playerCurrentHp', currentHp);
  localStorage.setItem('dnd_actionHelper', showHelper);
}

function loadPlayerPreferences() {
  document.getElementById('playerName').value = localStorage.getItem('dnd_playerName') || '';
  document.getElementById('playerMaxHp').value = localStorage.getItem('dnd_playerMaxHp') || '';
  document.getElementById('playerCurrentHp').value = localStorage.getItem('dnd_playerCurrentHp') || '';
  document.getElementById('actionHelperCheckbox').checked = localStorage.getItem('dnd_actionHelper') === 'true';
}

function checkForExistingSession() {
  const sessions = localStorage.getItem('dnd_dm_sessions');
  const rejoinBtn = document.getElementById('rejoinDmBtn');
  if (sessions && sessions !== '{}') {
    rejoinBtn.style.display = 'block';
  } else {
    rejoinBtn.style.display = 'none';
  }
}

// --- LÓGICA DE SALAS ---
function createRoom() {
  cleanupListeners();
  isDM = true;
  playerId = 'DM_' + generateId();
  roomId = generateId().substr(0, 5).toUpperCase();

  let sessions = JSON.parse(localStorage.getItem('dnd_dm_sessions')) || {};
  sessions[roomId] = playerId;
  localStorage.setItem('dnd_dm_sessions', JSON.stringify(sessions));

  db.ref(`rooms/${roomId}`).set({ characters: {}, started: false, currentCharacterId: null }).then(() => {
    showCombatView();
  });
}

function rejoinAsDM() {
  const inputRoomId = prompt("Ingresa el código de la sala de DM a la que quieres volver:");
  if (!inputRoomId) return;

  const sessions = JSON.parse(localStorage.getItem('dnd_dm_sessions')) || {};
  const dmPlayerId = sessions[inputRoomId.toUpperCase()];

  if (dmPlayerId) {
    isDM = true;
    roomId = inputRoomId.toUpperCase();
    playerId = dmPlayerId;
    showCombatView();
  } else {
    alert("No se encontró una sesión de DM guardada para esa sala. Asegúrate de que el código sea correcto.");
  }
}

function joinRoom() {
  const inputRoomId = document.getElementById("roomCodeInput").value.toUpperCase();
  if (!inputRoomId) return;

  db.ref(`rooms/${inputRoomId}`).once("value", snapshot => {
    if (snapshot.exists()) {
      cleanupListeners();
      roomId = inputRoomId;
      isDM = false;
      playerId = sessionStorage.getItem('dnd_room_' + roomId);

      if (playerId && snapshot.val().characters && snapshot.val().characters[playerId]) {
        showCombatView();
      } else {
        playerId = 'PLAYER_' + generateId();
        sessionStorage.setItem('dnd_room_' + roomId, playerId);
        loadPlayerPreferences();
        document.getElementById("createOrJoin").style.display = "none";
        document.getElementById("playerSetup").style.display = "block";
        updateRoomCodeDisplay();
      }
    } else {
      alert("Sala no encontrada.");
    }
  });
}

function showCombatView() {
  document.getElementById("createOrJoin").style.display = "none";
  document.getElementById("playerSetup").style.display = "none";
  document.getElementById("combatView").style.display = "block";
  updateRoomCodeDisplay();
  listenToCombat();
}

// --- LÓGICA DE PERSONAJES ---
function submitCharacter() {
  const name = document.getElementById("playerName").value.trim();
  const init = parseInt(document.getElementById("playerInit").value);
  const maxHp = parseInt(document.getElementById("playerMaxHp").value);
  let currentHp = parseInt(document.getElementById("playerCurrentHp").value);
  const showHelper = document.getElementById('actionHelperCheckbox').checked;

  if (!name || isNaN(init) || isNaN(maxHp) || maxHp <= 0) {
    alert("Por favor, ingresa nombre, iniciativa y vida máxima válidos.");
    return;
  }
  if (isNaN(currentHp) || currentHp <= 0) {
    currentHp = maxHp;
  }

  savePlayerPreferences(name, maxHp, currentHp, showHelper);

  const newCharacter = {
    id: playerId,
    name,
    init,
    maxHp,
    currentHp,
    isEnemy: false,
    showHelper: showHelper
  };
  
  db.ref(`rooms/${roomId}/characters/${playerId}`).set(newCharacter).then(showCombatView);
}

function addEnemy() {
  if (!isDM) return;
  const name = document.getElementById("enemyName").value.trim();
  const init = parseInt(document.getElementById("enemyInit").value);
  const maxHp = parseInt(document.getElementById("enemyMaxHp").value);
  if (!name || isNaN(init) || isNaN(maxHp) || maxHp <= 0) return;

  const enemyId = 'ENEMY_' + generateId();
  const newEnemy = { id: enemyId, name, init, maxHp, currentHp: maxHp, isEnemy: true }; // Los enemigos no tienen showHelper
  db.ref(`rooms/${roomId}/characters/${enemyId}`).set(newEnemy).then(() => {
    document.getElementById("enemyName").value = "";
    document.getElementById("enemyInit").value = "";
    document.getElementById("enemyMaxHp").value = "";
  });
}

function removeCharacter(characterId) {
  if (!isDM) return;
  if (confirm("¿Estás seguro de eliminar este personaje?")) {
    db.ref(`rooms/${roomId}/characters/${characterId}`).remove();
  }
}

// --- LÓGICA MODAL DE HP ---
function openHpModal(charId, charName, currentHp) {
  modalTarget = { charId, currentHp };
  document.getElementById('modalCharName').textContent = `Modificar Vida de ${charName}`;
  document.getElementById('modalCurrentHp').textContent = currentHp;
  document.getElementById('hpChangeInput').value = '';
  document.getElementById('hpModal').style.display = 'flex';
}

function closeHpModal() {
  document.getElementById('hpModal').style.display = 'none';
}

function applyHpChange(type) {
  const changeValue = parseInt(document.getElementById('hpChangeInput').value);
  if (isNaN(changeValue) || changeValue < 0) return;

  let newHp = (type === 'damage') ? modalTarget.currentHp - changeValue : modalTarget.currentHp + changeValue;
  if (newHp < 0) newHp = 0;

  db.ref(`rooms/${roomId}/characters/${modalTarget.charId}/currentHp`).set(newHp);
  closeHpModal();
}

function toggleAction(element) {
  element.classList.toggle('used');
}

// --- LÓGICA DE COMBATE (VERSIÓN MÁS SEGURA) ---
function listenToCombat() {
  if (combatListener) cleanupListeners();
  combatListener = db.ref(`rooms/${roomId}`).on("value", snapshot => {
    const data = snapshot.val();
    if (!data) { 
        alert("La sala ha sido cerrada."); 
        backToMenu(); 
        return; 
    }

    const myCharacter = (data.characters && data.characters[playerId]) ? data.characters[playerId] : null;
    if (myCharacter) {
      localStorage.setItem('dnd_playerCurrentHp', myCharacter.currentHp);
    }

    const amICurrentPlayer = data.currentCharacterId === playerId;
    
    const turnHelper = document.getElementById('turnHelper');
    // **CORRECCIÓN**: Verifica que `myCharacter` exista antes de leer `showHelper`
    if (amICurrentPlayer && myCharacter && myCharacter.showHelper) {
      turnHelper.style.display = 'block';
    } else {
      turnHelper.style.display = 'none';
    }
    
    document.getElementById('dmCombatControls').style.display = isDM ? 'block' : 'none';
    document.getElementById('startCombatBtn').style.display = isDM && !data.started ? 'inline-block' : 'none';
    document.getElementById('dmNextTurnBtn').style.display = isDM && data.started ? 'inline-block' : 'none';
    document.getElementById('playerEndTurnBtn').style.display = !isDM && data.started && amICurrentPlayer ? 'inline-block' : 'none';
    document.getElementById('endCombatBtn').style.display = isDM && data.started ? 'inline-block' : 'none';

    const list = document.getElementById("initiativeList");
    list.innerHTML = "";
    
    if (!isDM && !data.started) {
      list.innerHTML = "<li>Esperando a que el DM inicie el combate...</li>";
    } else {
      const characters = data.characters ? Object.values(data.characters) : [];
      if (characters.length === 0) {
        list.innerHTML = `<li>${isDM ? 'Añade personajes para empezar...' : 'Esperando personajes...'}</li>`;
      } else {
        characters.sort((a, b) => b.init - a.init);
        characters.forEach(char => {
          const li = document.createElement("li");
          const container = document.createElement("div");
          container.style.display = "flex";
          container.style.alignItems = "center";
          container.style.width = "100%";

          const charInfo = document.createElement("div");
          charInfo.className = "character-info";
          const charName = document.createElement("span");
          charName.className = "character-name";
          charName.textContent = `${char.name} (${char.init})`;
          charInfo.appendChild(charName);

          const canSeeHp = isDM || char.id === playerId;
          if (canSeeHp && char.maxHp) { // Verifica que tenga maxHp para no fallar con datos corruptos
            const hpBarContainer = document.createElement("div");
            hpBarContainer.className = "hp-bar-container";
            const hpBar = document.createElement("div");
            hpBar.className = "hp-bar";
            const hpPercentage = (char.currentHp / char.maxHp) * 100;
            hpBar.style.width = `${hpPercentage}%`;
            if (hpPercentage <= 25) hpBar.style.backgroundColor = '#c12727';
            else if (hpPercentage <= 50) hpBar.style.backgroundColor = '#c18b27';
            hpBarContainer.appendChild(hpBar);
            charInfo.appendChild(hpBarContainer);
          }
          container.appendChild(charInfo);

          if (canSeeHp) {
            const hpDisplay = document.createElement("div");
            hpDisplay.className = "hp-text-container";
            hpDisplay.textContent = `${char.currentHp} / ${char.maxHp}`;
            hpDisplay.onclick = () => openHpModal(char.id, char.name, char.currentHp);
            container.appendChild(hpDisplay);
          }

          // **CORRECCIÓN**: Solo muestra los iconos si es un jugador y tiene la opción activada
          if (char.id === playerId && char.showHelper) {
            const iconsContainer = document.createElement('div');
            iconsContainer.className = 'action-icons';
            iconsContainer.innerHTML = `<span class="action-icon" title="Acción" onclick="toggleAction(this)">⚔️</span><span class="action-icon" title="Acción Adicional" onclick="toggleAction(this)">✨</span><span class="action-icon" title="Movimiento" onclick="toggleAction(this)">🏃</span>`;
            container.appendChild(iconsContainer);
          }

          if (isDM) {
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "❌";
            deleteBtn.className = "delete-btn";
            deleteBtn.onclick = () => removeCharacter(char.id);
            container.appendChild(deleteBtn);
          }

          li.appendChild(container);
          if (char.isEnemy) li.classList.add("enemy");
          if (char.id === data.currentCharacterId) li.classList.add("current-turn");
          list.appendChild(li);
        });
      }
    }

    const turnDisplay = document.getElementById("turnDisplay");
    const currentCharacter = (data.characters && data.currentCharacterId) ? data.characters[data.currentCharacterId] : null;
    if (data.started && currentCharacter) { turnDisplay.textContent = `🎯 Turno de: ${currentCharacter.name}`; }
    else if (data.started) { turnDisplay.textContent = "¡Combate iniciado!"; }
    else { turnDisplay.textContent = "El combate no ha comenzado."; }
  });
}

function startCombat() {
  if (!isDM) return;
  db.ref(`rooms/${roomId}`).once("value", snapshot => {
    const data = snapshot.val();
    if (!data) return;
    const characters = data.characters ? Object.values(data.characters) : [];
    if (characters.length > 0) {
      characters.sort((a, b) => b.init - a.init);
      db.ref(`rooms/${roomId}`).update({ started: true, currentCharacterId: characters[0].id });
    }
  });
}

function nextTurn() {
  db.ref(`rooms/${roomId}`).once("value", snapshot => {
    const data = snapshot.val();
    if (!data || !data.started || (!isDM && data.currentCharacterId !== playerId)) return;

    const characters = data.characters ? Object.values(data.characters) : [];
    if (characters.length === 0) return;

    characters.sort((a, b) => b.init - a.init);
    const currentIndex = data.currentCharacterId ? characters.findIndex(c => c.id === data.currentCharacterId) : -1;
    const nextIndex = (currentIndex + 1) % characters.length;
    db.ref(`rooms/${roomId}`).update({ currentCharacterId: characters[nextIndex].id });
  });
}

function endCombat() {
  if (!isDM) return;
  if (confirm("¿Finalizar el combate? Se reiniciará el orden de turno y se conservará la vida actual de los personajes.")) {
    db.ref(`rooms/${roomId}`).update({ started: false, currentCharacterId: null });
  }
}

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', checkForExistingSession);