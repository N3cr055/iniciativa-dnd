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
let roomId = null; let playerId = null; let isDM = false; let combatListener = null;
let modalTarget = { charId: null, currentHp: 0 };
let dmViewingPlayerId = null;
let isPlayerPanelOpen = true; // Controla si el jugador quiere ver su panel

// --- FUNCIONES DE UTILIDAD ---
function generateId() { return Math.random().toString(36).substr(2, 9); }
function updateRoomCodeDisplay() { 
  const roomCodeDisplayElem = document.getElementById('roomCodeDisplay');
  if (roomCodeDisplayElem) roomCodeDisplayElem.textContent = roomId;
  const combatRoomCodeElem = document.getElementById('combatRoomCode');
  if (combatRoomCodeElem) combatRoomCodeElem.textContent = roomId;
}
function copyRoomCode() { navigator.clipboard.writeText(roomId).then(() => alert('Código copiado: ' + roomId)); }
function cleanupListeners() { if (combatListener && roomId) db.ref(`rooms/${roomId}`).off("value", combatListener); combatListener = null; }
function backToMenu() { 
  cleanupListeners(); 
  roomId = null; 
  isDM = false; 
  dmViewingPlayerId = null; 
  isPlayerPanelOpen = true; 
  hideCharacterPanel();
  document.getElementById("combatView").style.display = "none"; 
  document.getElementById("playerSetup").style.display = "none"; 
  document.getElementById("createOrJoin").style.display = "block"; 
  checkForExistingSession(); 
}

// --- LÓGICA DE SESIÓN Y PREFERENCIAS ---
function savePlayerPreferences(name, level, pClass, maxHp, currentHp, showHelper, stats) {
  localStorage.setItem('dnd_playerName', name);
  localStorage.setItem('dnd_playerLevel', level);
  localStorage.setItem('dnd_playerClass', pClass);
  localStorage.setItem('dnd_playerMaxHp', maxHp);
  localStorage.setItem('dnd_playerCurrentHp', currentHp);
  localStorage.setItem('dnd_actionHelper', showHelper);
  localStorage.setItem('dnd_playerStats', JSON.stringify(stats));
}

function loadPlayerPreferences() {
  document.getElementById('playerName').value = localStorage.getItem('dnd_playerName') || '';
  document.getElementById('playerLevel').value = localStorage.getItem('dnd_playerLevel') || '1';
  document.getElementById('playerClass').value = localStorage.getItem('dnd_playerClass') || 'Fighter';
  document.getElementById('playerMaxHp').value = localStorage.getItem('dnd_playerMaxHp') || '';
  document.getElementById('playerCurrentHp').value = localStorage.getItem('dnd_playerCurrentHp') || '';
  document.getElementById('actionHelperCheckbox').checked = localStorage.getItem('dnd_actionHelper') === 'true';
  const stats = JSON.parse(localStorage.getItem('dnd_playerStats')) || {};
  const statsIds = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  statsIds.forEach(id => {
      const value = stats[id.toLowerCase()] || 10;
      document.getElementById(`player${id}`).value = value;
      const modEl = document.getElementById(`player${id}_mod`);
      if(modEl) modEl.textContent = `(${calculateModifier(value) >= 0 ? '+' : ''}${calculateModifier(value)})`;
  });

  statsIds.forEach(id => {
      const inputEl = document.getElementById(`player${id}`);
      if (inputEl) {
          inputEl.oninput = (e) => {
              const modEl = document.getElementById(`player${id}_mod`);
              if(modEl) {
                  const value = parseInt(e.target.value) || 0;
                  modEl.textContent = `(${calculateModifier(value) >= 0 ? '+' : ''}${calculateModifier(value)})`;
              }
          };
      }
  });
}

function checkForExistingSession() {
  const sessions = localStorage.getItem('dnd_dm_sessions');
  const rejoinBtn = document.getElementById('rejoinDmBtn');
  if (rejoinBtn) {
    if (sessions && sessions !== '{}') {
      rejoinBtn.style.display = 'block';
    } else {
      rejoinBtn.style.display = 'none';
    }
  }
}

// --- LÓGICA DE SALAS ---
function createRoom() {
  cleanupListeners(); isDM = true; playerId = 'DM_' + generateId(); roomId = generateId().substr(0, 5).toUpperCase();
  let sessions = JSON.parse(localStorage.getItem('dnd_dm_sessions')) || {};
  sessions[roomId] = playerId;
  localStorage.setItem('dnd_dm_sessions', JSON.stringify(sessions));
  db.ref(`rooms/${roomId}`).set({ characters: {}, started: false, currentCharacterId: null }).then(showCombatView);
}

function rejoinAsDM() {
  const inputRoomId = prompt("Ingresa el código de la sala de DM:");
  if (!inputRoomId) return;
  const sessions = JSON.parse(localStorage.getItem('dnd_dm_sessions')) || {};
  const dmPlayerId = sessions[inputRoomId.toUpperCase()];
  if (dmPlayerId) {
    isDM = true; roomId = inputRoomId.toUpperCase(); playerId = dmPlayerId;
    showCombatView();
  } else {
    alert("No se encontró una sesión de DM guardada para esa sala.");
  }
}

function joinRoom() {
  const inputRoomId = document.getElementById("roomCodeInput").value.toUpperCase();
  if (!inputRoomId) return;
  db.ref(`rooms/${inputRoomId}`).once("value", snapshot => {
    if (snapshot.exists()) {
      cleanupListeners(); roomId = inputRoomId; isDM = false;
      playerId = sessionStorage.getItem('dnd_room_' + roomId); 
      if (playerId && snapshot.val().characters && snapshot.val().characters[playerId]) {
        showCombatView();
      } else {
        playerId = 'PLAYER_' + generateId();
        // **AQUÍ ESTABA EL ERROR - CORREGIDO**
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
  const level = parseInt(document.getElementById("playerLevel").value) || 1;
  const pClass = document.getElementById("playerClass").value;
  const init = parseInt(document.getElementById("playerInit").value);
  const maxHp = parseInt(document.getElementById("playerMaxHp").value);
  let currentHp = parseInt(document.getElementById("playerCurrentHp").value);
  const showHelper = document.getElementById('actionHelperCheckbox').checked;

  const stats = {
    str: parseInt(document.getElementById('playerSTR').value) || 10,
    dex: parseInt(document.getElementById('playerDEX').value) || 10,
    con: parseInt(document.getElementById('playerCON').value) || 10,
    int: parseInt(document.getElementById('playerINT').value) || 10,
    wis: parseInt(document.getElementById('playerWIS').value) || 10,
    cha: parseInt(document.getElementById('playerCHA').value) || 10
  };

  if (!name || isNaN(init) || isNaN(maxHp) || maxHp <= 0) { alert("Por favor, ingresa nombre, iniciativa y vida máxima válidos."); return; }
  if (isNaN(currentHp) || currentHp <= 0) { currentHp = maxHp; }

  savePlayerPreferences(name, level, pClass, maxHp, currentHp, showHelper, stats);
  
  const maxSlots = getSpellSlotsByLevel(level, pClass);
  const spellSlots = {};
  for (let i = 1; i <= 9; i++) {
    const max = maxSlots[`level${i}`] || 0;
    spellSlots[`level${i}`] = { current: max, max: max };
  }
  if(pClass === 'Warlock') {
      spellSlots.pact = { current: maxSlots.pact.slots, max: maxSlots.pact.slots, level: maxSlots.pact.level };
  }

  const newCharacter = {
    id: playerId, name, level, pClass, init, maxHp, currentHp,
    isEnemy: false, showHelper: showHelper,
    inspiration: 0,
    editLocked: false,
    stats: stats,
    spellSlots: spellSlots
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
  const newEnemy = { id: enemyId, name, init, maxHp, currentHp: maxHp, isEnemy: true };
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

// --- NUEVAS FUNCIONES (FASE 2 - ACTUALIZADAS) ---
function calculateModifier(score) {
    return Math.floor((parseInt(score) - 10) / 2);
}

function changeInspiration(targetPlayerId, currentInspiration, amount) {
    if (!isDM) return;
    let newVal = (currentInspiration || 0) + amount;
    if (newVal < 0) newVal = 0;
    if (newVal > 3) newVal = 3;
    db.ref(`rooms/${roomId}/characters/${targetPlayerId}/inspiration`).set(newVal);
}

function spendInspiration() {
    const targetPlayerId = document.getElementById('characterPanel').getAttribute('data-viewing-playerid');
    if (targetPlayerId !== playerId || isDM) return;
    
    db.ref(`rooms/${roomId}/characters/${targetPlayerId}/inspiration`).once('value', snapshot => {
        const currentInspiration = snapshot.val() || 0;
        if (currentInspiration > 0) {
            db.ref(`rooms/${roomId}/characters/${targetPlayerId}/inspiration`).set(currentInspiration - 1);
        }
    });
}

function toggleEditLock(targetPlayerId, currentState) {
    if (!isDM) return;
    db.ref(`rooms/${roomId}/characters/${targetPlayerId}/editLocked`).set(!currentState);
}

function updateStat(inputElement, statName) {
  const targetPlayerId = inputElement.closest('#characterPanel').getAttribute('data-viewing-playerid');
  if (!targetPlayerId) return;
  const value = parseInt(inputElement.value);
  if (!isNaN(value)) {
    db.ref(`rooms/${roomId}/characters/${targetPlayerId}/stats/${statName}`).set(value);
  }
}

function updateSpellSlot(inputElement, level, type) {
  const targetPlayerId = inputElement.closest('#characterPanel').getAttribute('data-viewing-playerid');
  if (!targetPlayerId) return;
  const numValue = parseInt(inputElement.value);
  const path = (level === 'pact') ? `spellSlots/pact/${type}` : `spellSlots/level${level}/${type}`;
  if (!isNaN(numValue) && numValue >= 0) {
    db.ref(`rooms/${roomId}/characters/${targetPlayerId}/${path}`).set(numValue);
  }
}

function getSpellSlotsByLevel(level, className) {
    const fullCaster = [ [0,0,0,0,0,0,0,0,0], [2,0,0,0,0,0,0,0,0], [3,0,0,0,0,0,0,0,0], [4,2,0,0,0,0,0,0,0], [4,3,0,0,0,0,0,0,0], [4,3,2,0,0,0,0,0,0], [4,3,3,0,0,0,0,0,0], [4,3,3,1,0,0,0,0,0], [4,3,3,2,0,0,0,0,0], [4,3,3,3,1,0,0,0,0], [4,3,3,3,2,0,0,0,0], [4,3,3,3,2,1,0,0,0], [4,3,3,3,2,1,0,0,0], [4,3,3,3,2,1,1,0,0], [4,3,3,3,2,1,1,0,0], [4,3,3,3,2,1,1,1,0], [4,3,3,3,2,1,1,1,0], [4,3,3,3,2,1,1,1,1], [4,3,3,3,3,1,1,1,1], [4,3,3,3,3,2,1,1,1], [4,3,3,3,3,2,2,1,1] ];
    const halfCaster = [ [0,0,0,0,0], [0,0,0,0,0], [2,0,0,0,0], [3,0,0,0,0], [3,0,0,0,0], [4,2,0,0,0], [4,2,0,0,0], [4,3,0,0,0], [4,3,0,0,0], [4,3,2,0,0], [4,3,2,0,0], [4,3,3,0,0], [4,3,3,0,0], [4,3,3,1,0], [4,3,3,1,0], [4,3,3,2,0], [4,3,3,2,0], [4,3,3,3,1], [4,3,3,3,1], [4,3,3,3,2], [4,3,3,3,2] ];
    const warlockSlots = [ [0,0], [1,1], [2,1], [2,2], [2,2], [2,3], [2,3], [2,4], [2,4], [2,5], [2,5], [3,5], [3,5], [3,5], [3,5], [3,5], [3,5], [4,5], [4,5], [4,5], [4,5] ];

    let slots = {};
    if (['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'].includes(className)) {
        const s = fullCaster[level];
        for (let i = 0; i < 9; i++) slots[`level${i+1}`] = s[i];
    } else if (['Paladin', 'Ranger', 'Artificer'].includes(className)) {
        const s = halfCaster[level];
        for (let i = 0; i < 5; i++) slots[`level${i+1}`] = s[i];
    } else if (className === 'Warlock') {
        const s = warlockSlots[level];
        slots.pact = { slots: s[0], level: s[1] };
    }
    return slots;
}

function renderCharacterPanel(character) {
  const charPanel = document.getElementById('characterPanel');
  charPanel.style.display = 'block';
  charPanel.setAttribute('data-viewing-playerid', character.id);

  document.getElementById('characterPanelTitle').textContent = `Panel de: ${character.name}`;

  const isLocked = character.editLocked || false;
  
  const currentInspiration = character.inspiration || 0;
  document.getElementById('inspirationCount').textContent = currentInspiration;
  const spendBtn = document.getElementById('spendInspirationBtn');
  spendBtn.disabled = (isLocked || currentInspiration === 0 || isDM || (playerId !== character.id));
  
  if (character.stats) {
      ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].forEach(stat => {
          const s = stat.toLowerCase();
          const value = character.stats[s] || 10;
          const inputEl = document.getElementById(`stat${stat}`);
          const modEl = document.getElementById(`stat${stat}_mod`);
          inputEl.value = value;
          inputEl.disabled = isLocked;
          const mod = calculateModifier(value);
          modEl.textContent = `(${mod >= 0 ? '+' : ''}${mod})`;
      });
  }
  
  const grid = document.getElementById('spellSlotGrid');
  grid.innerHTML = '';
  const charLevel = character.level || 1;
  const charClass = character.pClass || 'Other';
  const maxSlots = getSpellSlotsByLevel(charLevel, charClass);

  if(charClass === 'Warlock') {
      document.getElementById('spellSlotsTitle').textContent = "Conjuros de Pacto";
      const pactData = maxSlots.pact || { slots: 0, level: 0};
      const slotData = character.spellSlots.pact || { current: pactData.slots, max: pactData.slots };
      const spellLevelDiv = document.createElement('div');
      spellLevelDiv.className = 'spell-level';
      spellLevelDiv.style.gridColumn = "1 / -1";
      spellLevelDiv.innerHTML = `
        <label>Nivel ${pactData.level}</label>
        <div class="spell-input-group">
            <label>Act:</label>
            <input type="number" value="${slotData.current}" onchange="updateSpellSlot(this, 'pact', 'current')">
        </div>
        <span>/</span>
        <div class="spell-input-group">
            <label>Max:</label>
            <input type="number" value="${slotData.max}" onchange="updateSpellSlot(this, 'pact', 'max')" ${isLocked ? 'disabled' : ''}>
        </div>
      `;
      grid.appendChild(spellLevelDiv);
  } else {
      document.getElementById('spellSlotsTitle').textContent = "Espacios de Conjuro";
      let hasSpells = false;
      for (let i = 1; i <= 9; i++) {
          const max = maxSlots[`level${i}`] || 0;
          if (max === 0) continue;
          hasSpells = true;
          
          const slotData = character.spellSlots[`level${i}`] || { current: max, max: max };
          const spellLevelDiv = document.createElement('div');
          spellLevelDiv.className = 'spell-level';
          spellLevelDiv.innerHTML = `
            <label>Nivel ${i}:</label>
            <div class="spell-input-group">
                <label>Act:</label>
                <input type="number" value="${slotData.current}" onchange="updateSpellSlot(this, ${i}, 'current')">
            </div>
            <span>/</span>
            <div class="spell-input-group">
                <label>Max:</label>
                <input type="number" value="${slotData.max}" onchange="updateSpellSlot(this, ${i}, 'max')" ${isLocked ? 'disabled' : ''}>
            </div>
          `;
          grid.appendChild(spellLevelDiv);
      }
      if (!hasSpells) {
          grid.innerHTML = `<span style="font-size: 0.9em; color: #888;">Esta clase no tiene espacios de conjuro.</span>`;
      }
  }
}

function hideCharacterPanel() {
  const charPanel = document.getElementById('characterPanel');
  charPanel.style.display = 'none';
  charPanel.setAttribute('data-viewing-playerid', '');
  if (isDM) {
      dmViewingPlayerId = null;
  } else {
      isPlayerPanelOpen = false; // El jugador ha cerrado su panel
  }
}

// --- LÓGICA DE COMBATE ---
function listenToCombat() {
  if (combatListener) cleanupListeners();
  combatListener = db.ref(`rooms/${roomId}`).on("value", snapshot => {
    const data = snapshot.val();
    if (!data) { alert("La sala ha sido cerrada."); backToMenu(); return; }

    const myCharacter = (data.characters && data.characters[playerId]) ? data.characters[playerId] : null;
    if (myCharacter) {
      localStorage.setItem('dnd_playerCurrentHp', myCharacter.currentHp);
    }
    const amICurrentPlayer = data.currentCharacterId === playerId;
    
    let characterToDisplay = null;
    if (!isDM && isPlayerPanelOpen) {
      characterToDisplay = myCharacter;
    } else if (isDM && dmViewingPlayerId && data.characters && data.characters[dmViewingPlayerId]) {
      characterToDisplay = data.characters[dmViewingPlayerId];
    }
    
    if (characterToDisplay) {
      renderCharacterPanel(characterToDisplay);
    } else {
      hideCharacterPanel();
    }

    const turnHelper = document.getElementById('turnHelper');
    if (amICurrentPlayer && myCharacter && myCharacter.showHelper) { turnHelper.style.display = 'block'; } 
    else { turnHelper.style.display = 'none'; }
    
    document.getElementById('dmCombatControls').style.display = isDM ? 'block' : 'none';
    document.getElementById('startCombatBtn').style.display = isDM && !data.started ? 'inline-block' : 'none';
    document.getElementById('dmNextTurnBtn').style.display = isDM && data.started ? 'inline-block' : 'none';
    document.getElementById('playerEndTurnBtn').style.display = !isDM && data.started && amICurrentPlayer ? 'inline-block' : 'none';
    document.getElementById('endCombatBtn').style.display = isDM && data.started ? 'inline-block' : 'none';

    const list = document.getElementById("initiativeList");
    list.innerHTML = "";
    
    if (!isDM && !data.started) { list.innerHTML = "<li>Esperando a que el DM inicie el combate...</li>"; } 
    else {
      const characters = data.characters ? Object.values(data.characters) : [];
      if (characters.length === 0) { list.innerHTML = `<li>${isDM ? 'Añade personajes para empezar...' : 'Esperando personajes...'}</li>`; } 
      else {
        characters.sort((a, b) => b.init - a.init);
        characters.forEach(char => {
          const li = document.createElement("li");
          const container = document.createElement("div");
          container.style.display = "flex"; container.style.alignItems = "center"; container.style.width = "100%";
          const charInfo = document.createElement("div"); charInfo.className = "character-info";
          const charName = document.createElement("span"); charName.className = "character-name";
          
          const inspireCount = char.inspiration || 0;
          const inspireIcon = inspireCount > 0 ? `⭐(${inspireCount})` : ''; // Icono de estrella
          charName.textContent = `${char.name} (${char.init}) ${inspireIcon}`;
          
          if (isDM && !char.isEnemy) {
            charName.classList.add('character-name-clickable');
            charName.title = `Ver panel de ${char.name}`;
            charName.onclick = () => {
              dmViewingPlayerId = char.id;
              db.ref(`rooms/${roomId}/characters/${char.id}`).once('value', s => renderCharacterPanel(s.val()));
            };
          }
          
          if (char.id === playerId && !isDM) {
              charName.classList.add('character-name-clickable');
              charName.title = `Ver mi panel`;
              charName.onclick = () => {
                  isPlayerPanelOpen = true;
                  renderCharacterPanel(char);
              };
          }
          
          charInfo.appendChild(charName);
          
          const canSeeHp = isDM || char.id === playerId;
          if (canSeeHp && char.maxHp) {
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

          if (char.id === playerId && myCharacter && myCharacter.showHelper) {
            const iconsContainer = document.createElement('div');
            iconsContainer.className = 'action-icons';
            iconsContainer.innerHTML = `<span class="action-icon" title="Acción" onclick="toggleAction(this)">⚔️</span><span class="action-icon" title="Acción Adicional" onclick="toggleAction(this)">✨</span><span class="action-icon" title="Movimiento" onclick="toggleAction(this)">🏃</span>`;
            container.appendChild(iconsContainer);
          }

          if (isDM) {
            if (!char.isEnemy) {
              const lockBtn = document.createElement("button");
              lockBtn.textContent = char.editLocked ? '🔒' : '🔓';
              lockBtn.className = 'dm-tool-btn';
              lockBtn.title = char.editLocked ? "Desbloquear Edición" : "Bloquear Edición";
              lockBtn.onclick = () => toggleEditLock(char.id, char.editLocked);
              container.appendChild(lockBtn);

              const inspirePlus = document.createElement("button");
              inspirePlus.textContent = '+⭐';
              inspirePlus.className = 'dm-tool-btn';
              inspirePlus.title = "Dar Inspiración";
              inspirePlus.onclick = () => changeInspiration(char.id, char.inspiration, 1);
              container.appendChild(inspirePlus);

              const inspireMinus = document.createElement("button");
              inspireMinus.textContent = '-⭐';
              inspireMinus.className = 'dm-tool-btn';
              inspireMinus.title = "Quitar Inspiración";
              inspireMinus.onclick = () => changeInspiration(char.id, char.inspiration, -1);
              container.appendChild(inspireMinus);
            }
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

// --- FUNCIONES DE COMBATE ---
function startCombat() {
  if (!isDM) return;
  db.ref(`rooms/${roomId}/characters`).once('value', snapshot => {
      const characters = snapshot.val();
      if(characters) {
          for (const charId in characters) {
              if (characters[charId] && !characters[charId].isEnemy) {
                  db.ref(`rooms/${roomId}/characters/${charId}/editLocked`).set(true);
              }
          }
      }
  });
  
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
  if (confirm("¿Finalizar el combate? Se reiniciará el orden de turno y se desbloqueará la edición de personajes.")) {
    db.ref(`rooms/${roomId}/characters`).once('value', snapshot => {
        const characters = snapshot.val();
        if(characters) {
            for (const charId in characters) {
                if (characters[charId] && !characters[charId].isEnemy) {
                    db.ref(`rooms/${roomId}/characters/${charId}/editLocked`).set(false);
                }
            }
        }
    });
    db.ref(`rooms/${roomId}`).update({ started: false, currentCharacterId: null });
  }
}

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById("createOrJoin").style.display = "block";
  checkForExistingSession();
});