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

let roomId = "";
let isDM = false;
let combatListener = null;
let currentPlayerName = "";
let showActionHelper = false;

function updateRoomCodeDisplay() {
  const roomCodeDisplayElem = document.getElementById('roomCodeDisplay');
  if (roomCodeDisplayElem) roomCodeDisplayElem.textContent = roomId;
  const combatRoomCodeElem = document.getElementById('combatRoomCode');
  if (combatRoomCodeElem) combatRoomCodeElem.textContent = roomId;
}

function copyRoomCode() {
  navigator.clipboard.writeText(roomId).then(() => alert('Código copiado: ' + roomId));
}

function cleanupListeners() {
  if (combatListener && roomId) db.ref(`rooms/${roomId}`).off("value", combatListener);
  combatListener = null;
}

function createRoom() {
  cleanupListeners();
  roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
  db.ref(`rooms/${roomId}`).set({ players: {}, enemies: {}, started: false, currentCharacter: null })
    .then(() => {
      isDM = true;
      document.getElementById("createOrJoin").style.display = "none";
      document.getElementById("combatView").style.display = "block"; 
      updateRoomCodeDisplay();
      listenToCombat(); 
    });
}

function joinRoom() {
  cleanupListeners();
  roomId = document.getElementById("roomCodeInput").value.toUpperCase();
  if (!roomId) return;
  db.ref(`rooms/${roomId}`).once("value", snapshot => {
    if (snapshot.exists()) {
      document.getElementById("createOrJoin").style.display = "none";
      document.getElementById("playerSetup").style.display = "block";
      updateRoomCodeDisplay();
      loadPlayerPreferences();
    } else {
      alert("Sala no encontrada.");
    }
  });
}

function submitInitiative() {
  const name = document.getElementById("playerName").value.trim();
  const init = parseInt(document.getElementById("playerInit").value);
  if (!name || isNaN(init)) {
    alert("Por favor ingresa un nombre y iniciativa válidos");
    return;
  }
  currentPlayerName = name;
  showActionHelper = document.getElementById('actionHelperCheckbox').checked;
  
  localStorage.setItem('dndPlayerName', name);
  localStorage.setItem('dndActionHelper', showActionHelper);

  db.ref(`rooms/${roomId}/players`).push({ name, init })
    .then(() => {
      document.getElementById("playerSetup").style.display = "none";
      document.getElementById("combatView").style.display = "block";
      updateRoomCodeDisplay();
      listenToCombat();
    });
}

function addEnemy() {
  const name = document.getElementById("enemyName").value.trim();
  const init = parseInt(document.getElementById("enemyInit").value);
  if (!name || isNaN(init)) return;
  db.ref(`rooms/${roomId}/enemies`).push({ name, init })
    .then(() => {
      document.getElementById("enemyName").value = "";
      document.getElementById("enemyInit").value = "";
    });
}

function startCombat() {
  db.ref(`rooms/${roomId}`).update({ started: true, currentCharacter: null });
}

function removeCharacter(characterId, characterType) {
  if (!isDM) return;
  if (confirm("¿Estás seguro de eliminar este personaje?")) {
    db.ref(`rooms/${roomId}/${characterType}/${characterId}`).remove();
  }
}

function editInitiative(characterId, characterType, currentInit) {
  if (!isDM) return;
  const newInit = prompt("Ingresa la nueva iniciativa:", currentInit);
  if (newInit !== null && !isNaN(newInit)) {
    db.ref(`rooms/${roomId}/${characterType}/${characterId}/init`).set(parseInt(newInit));
  }
}

function listenToCombat() {
  if (combatListener) db.ref(`rooms/${roomId}`).off("value", combatListener);

  combatListener = function(snapshot) {
    const data = snapshot.val();
    if (!data) {
      backToMenu();
      alert("La sala ha sido cerrada.");
      return;
    }

    // --- (La lógica de visibilidad de botones sigue igual) ---
    const dmCombatControls = document.getElementById('dmCombatControls');
    const startCombatBtn = document.getElementById('startCombatBtn');
    const dmNextTurnBtn = document.getElementById('dmNextTurnBtn');
    const playerEndTurnBtn = document.getElementById('playerEndTurnBtn');
    const endCombatBtn = document.getElementById('endCombatBtn');
    const turnHelper = document.getElementById('turnHelper');

    if (isDM) {
      dmCombatControls.style.display = 'block';
      turnHelper.style.display = 'none';
      if (data.started) {
        startCombatBtn.style.display = 'none';
        dmNextTurnBtn.style.display = 'inline-block';
        endCombatBtn.style.display = 'inline-block';
      } else {
        startCombatBtn.style.display = 'inline-block';
        dmNextTurnBtn.style.display = 'none';
        endCombatBtn.style.display = 'none';
      }
    } else { // Jugador
      dmCombatControls.style.display = 'none';
      startCombatBtn.style.display = 'none';
      dmNextTurnBtn.style.display = 'none';
      endCombatBtn.style.display = 'none';
      turnHelper.style.display = showActionHelper ? 'block' : 'none';
      playerEndTurnBtn.style.display = (data.started && data.currentCharacter === currentPlayerName) ? 'inline-block' : 'none';
    }

    // --- LÓGICA DE FILTRADO DE PERSONAJES (CAMBIO PRINCIPAL) ---
    const allCharacters = [];
    
    // JUGADORES: Siempre se muestran a todos.
    if (data.players) Object.entries(data.players).forEach(([id, p]) => allCharacters.push({ id, ...p, type: 'player' }));
    
    // ENEMIGOS: Solo se añaden a la lista si eres DM o si el combate ya empezó.
    if (isDM || data.started) {
      if (data.enemies) Object.entries(data.enemies).forEach(([id, e]) => allCharacters.push({ id, ...e, type: 'enemy' }));
    }
    
    allCharacters.sort((a, b) => b.init - a.init);
    
    const list = document.getElementById("initiativeList");
    list.innerHTML = "";
    
    let currentCharacterName = data.currentCharacter;
    if (!currentCharacterName && allCharacters.length > 0 && data.started) {
      currentCharacterName = allCharacters[0].name;
      db.ref(`rooms/${roomId}`).update({ currentCharacter: currentCharacterName });
      return;
    }
    
    allCharacters.forEach(char => {
      // --- (La lógica para renderizar cada 'li' sigue igual que antes) ---
      const li = document.createElement("li");
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.alignItems = "center";
      container.style.width = "100%";
      const charText = document.createElement("span");
      let displayText = `${char.name} (${char.init})`;
      if (char.name === currentCharacterName) {
        charText.innerHTML = `🎯 <strong>${displayText}</strong>`;
        li.classList.add("current-turn");
      } else {
        charText.textContent = displayText;
      }
      container.appendChild(charText);
      if (char.name === currentPlayerName && showActionHelper && data.started) {
        const iconsContainer = document.createElement('div');
        iconsContainer.className = 'action-icons';
        iconsContainer.innerHTML = `<span class="action-icon" title="Acción" onclick="toggleAction(this)">⚔️</span><span class="action-icon" title="Acción Adicional" onclick="toggleAction(this)">✨</span><span class="action-icon" title="Movimiento" onclick="toggleAction(this)">🏃</span>`;
        container.appendChild(iconsContainer);
      }
      if (isDM) {
        const dmTools = document.createElement('div');
        dmTools.style.marginLeft = 'auto';
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "❌";
        deleteBtn.className = "delete-btn";
        deleteBtn.onclick = () => removeCharacter(char.id, char.type + 's');
        dmTools.appendChild(deleteBtn);
        charText.style.cursor = "pointer";
        charText.onclick = () => editInitiative(char.id, char.type + 's', char.init);
        if (!container.querySelector('.action-icons')) {
            container.appendChild(dmTools);
        }
      }
      li.appendChild(container);
      if (char.type === 'enemy') li.classList.add("enemy");
      list.appendChild(li);
    });
    
    // --- LÓGICA DE MENSAJE DE ESTADO (CAMBIO PRINCIPAL) ---
    const turnDisplay = document.getElementById("turnDisplay");
    if (isDM) {
      // Mensajes para el DM
      if (currentCharacterName) {
        turnDisplay.textContent = `🎯 Turno de: ${currentCharacterName}`;
      } else if (allCharacters.length > 0) {
        turnDisplay.textContent = "Combate listo para iniciar.";
      } else {
        turnDisplay.textContent = "Añade personajes para empezar.";
      }
    } else {
      // Mensajes para el Jugador
      if (data.started) {
        turnDisplay.textContent = currentCharacterName ? `🎯 Turno de: ${currentCharacterName}` : "¡El combate ha comenzado!";
      } else {
        turnDisplay.textContent = "Esperando a que el DM inicie el combate...";
      }
    }
  };
  
  db.ref(`rooms/${roomId}`).on("value", combatListener);
}

function nextTurn() {
  db.ref(`rooms/${roomId}`).once("value", snapshot => {
    const data = snapshot.val();
    if (!data || !data.started) return;
    const allCharacters = [];
    if (data.players) Object.values(data.players).forEach(p => allCharacters.push(p));
    if (data.enemies) Object.values(data.enemies).forEach(e => allCharacters.push(e));
    if (allCharacters.length === 0) return;
    
    allCharacters.sort((a, b) => b.init - a.init);
    const currentIndex = data.currentCharacter ? allCharacters.findIndex(c => c.name === data.currentCharacter) : -1;
    const nextIndex = (currentIndex + 1) % allCharacters.length;
    db.ref(`rooms/${roomId}`).update({ currentCharacter: allCharacters[nextIndex].name });
  });
}

function endCombat() {
  if (!isDM) return;
  if (confirm("¿Finalizar el combate? Se eliminarán todos los personajes.")) {
    db.ref(`rooms/${roomId}`).update({ players: null, enemies: null, started: false, currentCharacter: null });
  }
}

function backToMenu() {
  cleanupListeners();
  roomId = "";
  isDM = false;
  currentPlayerName = "";
  showActionHelper = false;
  document.getElementById("combatView").style.display = "none";
  document.getElementById("playerSetup").style.display = "none";
  document.getElementById("createOrJoin").style.display = "block";
  document.getElementById("roomCodeInput").value = "";
  document.getElementById("playerName").value = "";
  document.getElementById("playerInit").value = "";
}

function loadPlayerPreferences() {
  const savedName = localStorage.getItem('dndPlayerName');
  if (savedName) document.getElementById('playerName').value = savedName;
  
  const savedHelperPref = localStorage.getItem('dndActionHelper');
  if (savedHelperPref) document.getElementById('actionHelperCheckbox').checked = (savedHelperPref === 'true');
}

function toggleAction(element) {
  element.classList.toggle('used');
}

window.addEventListener('beforeunload', cleanupListeners);
window.addEventListener('DOMContentLoaded', loadPlayerPreferences);