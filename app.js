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
let bestiarioCustom = [];

function loadCustomBestiary() {
    if (!isDM) return;
    db.ref('bestiario_custom').on('value', snapshot => {
        const data = snapshot.val();
        bestiarioCustom = data ? Object.values(data) : [];
    });
}

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
let isPlayerPanelOpen = false; 

// --- FUNCIONES DE UTILIDAD ---

// NUEVA FUNCIÓN: Ordena la iniciativa con reglas estrictas y de D&D 5e

// --- CALCULADORA DE DIFICULTAD D&D 5E ---
const xpByCR = {
    "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
    "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000,
    "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000, "30": 155000
};
const thresholdsByLevel = {
    1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
    5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
    9: [500, 1050, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
    13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
    17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700]
};

function updateDifficultyTracker(characters) {
    if (!isDM) return;
    const players = characters.filter(c => !c.isEnemy);
    const enemies = characters.filter(c => c.isEnemy);
    const diffSpan = document.getElementById('difficultyLevel');
    
    if (!diffSpan) return;
    if (players.length === 0 || enemies.length === 0) {
        diffSpan.innerHTML = "Esperando...";
        return;
    }

    let partyThresholds = [0, 0, 0, 0];
    players.forEach(p => {
        const t = thresholdsByLevel[p.level || 1] || thresholdsByLevel[1];
        partyThresholds[0] += t[0]; partyThresholds[1] += t[1];
        partyThresholds[2] += t[2]; partyThresholds[3] += t[3];
    });

    let totalXP = 0;
    enemies.forEach(e => { totalXP += (xpByCR[e.cr || "0"] || 0); });

    let mCount = enemies.length;
    let tier = 0;
    if (mCount === 1) tier = 0;
    else if (mCount === 2) tier = 1;
    else if (mCount >= 3 && mCount <= 6) tier = 2;
    else if (mCount >= 7 && mCount <= 10) tier = 3;
    else if (mCount >= 11 && mCount <= 14) tier = 4;
    else if (mCount >= 15) tier = 5;

    // Regla de tamaño de grupo
    if (players.length >= 6) tier = Math.max(0, tier - 1);
    else if (players.length <= 2) tier = Math.min(5, tier + 1);

    const multipliers = [1, 1.5, 2, 2.5, 3, 4, 5];
    const adjustedXP = totalXP * multipliers[tier];

    let text = "Fácil"; let color = "#3a8a06";
    if (adjustedXP >= partyThresholds[3]) { text = "Mortal"; color = "#6b2b2b"; }
    else if (adjustedXP >= partyThresholds[2]) { text = "Difícil"; color = "#c12727"; }
    else if (adjustedXP >= partyThresholds[1]) { text = "Media"; color = "#c18b27"; }

    diffSpan.innerHTML = `<span style="color: ${color}; font-weight: bold;">${text}</span> (XP: ${adjustedXP})`;
}


function cargarMonstruosFrecuentes() {
    if (!isDM) return;
    
    // Cambiamos .once por .on para actualización dinámica
    db.ref('analytics/monstruos_usados').orderByChild('count').limitToLast(5).on('value', snapshot => {
        const contenedor = document.getElementById('frecuentesContainer');
        if (!contenedor) return;
        
        contenedor.innerHTML = '<span style="font-size: 0.8em; color: #888;">Frecuentes:</span>';
        const monstruos = [];
        snapshot.forEach(child => { monstruos.unshift({ nombre: child.key, data: child.val() }); });
        
        monstruos.forEach(m => {
            const btn = document.createElement('button');
            btn.className = 'dm-tool-btn';
            btn.style.backgroundColor = '#4a3f35';
            btn.textContent = m.nombre.charAt(0) + m.nombre.slice(1).toLowerCase();
            
            const hp = m.data.hp || 10;
            const dex = m.data.dexMod || 0;
            const cr = m.data.cr || "";
            
            btn.onclick = () => quickAddMonster(btn.textContent, hp, dex, cr);
            contenedor.appendChild(btn);
        });
    });
}

function sortCharacters(characters) {
  characters.sort((a, b) => {
    // 1er Filtro: El número de iniciativa más alto va primero
    if (b.init !== a.init) {
      return b.init - a.init;
    }
    
    // 2do Filtro (D&D 5e): Si hay empate, los Jugadores van antes que los Enemigos
    if (a.isEnemy !== b.isEnemy) {
      return a.isEnemy ? 1 : -1; 
    }
    
    // 3er Filtro (Fijador de Bug): Si dos del mismo bando empatan, usamos su ID único 
    // para que su posición en la lista jamás cambie mágicamente.
    return a.id.localeCompare(b.id);
  });
}

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
  // Solo esconde la pantalla, NO borra la sesión. Permite reconexión si recargan.
  document.getElementById("combatView").style.display = "none"; 
  document.getElementById("playerSetup").style.display = "none"; 
  document.getElementById("createOrJoin").style.display = "block"; 
}

// FASE 3: Botón para salir por completo de la sala y limpiar la memoria
function disconnectAndMenu() {
  cleanupListeners(); 
  if (roomId) {
      localStorage.removeItem('dnd_room_' + roomId);
  }
  localStorage.removeItem('dnd_lastRoom');
  roomId = null; 
  isDM = false; 
  dmViewingPlayerId = null; 
  isPlayerPanelOpen = false; 
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
  
  const roomUpper = inputRoomId.toUpperCase();

  // Vamos a preguntarle a Firebase si la sala existe de verdad
  db.ref(`rooms/${roomUpper}`).once("value", snapshot => {
    if (snapshot.exists()) {
      const sessions = JSON.parse(localStorage.getItem('dnd_dm_sessions')) || {};
      let dmPlayerId = sessions[roomUpper];

      // Si el navegador del Master borró la memoria, le creamos una ID nueva para que pase
      if (!dmPlayerId) {
        dmPlayerId = 'DM_' + generateId();
        sessions[roomUpper] = dmPlayerId;
        localStorage.setItem('dnd_dm_sessions', JSON.stringify(sessions));
      }

      // Le damos los permisos y lo dejamos pasar
      cleanupListeners();
      isDM = true; 
      roomId = roomUpper; 
      playerId = dmPlayerId;
      showCombatView();
    } else {
      // Si la sala de verdad no existe en la base de datos
      alert("Esa sala no existe o ya fue finalizada por completo.");
    }
  });
}

function joinRoom() {
  const roomInput = document.getElementById("roomInput").value.trim().toUpperCase();

  if (!roomInput) { alert("Por favor, ingresa el código de la sala."); return; }

  db.ref(`rooms/${roomInput}`).once("value", snapshot => {
    if (!snapshot.exists()) { alert("Esa sala no existe o ya fue cerrada."); return; }

    roomId = roomInput;
    isDM = false;

    // Carga los datos del jugador desde el dispositivo ANTES de mostrar la pantalla
    loadPlayerPreferences();

    // NUEVO: Oculta el panel de estadísticas y desmarca la casilla por defecto
    document.getElementById("toggleStatsCheckbox").checked = false;
    document.getElementById("optionalStatsContainer").classList.add("hidden");

    document.getElementById("createOrJoin").style.display = "none";
    document.getElementById("playerSetup").style.display = "block";
    updateRoomCodeDisplay();
  });
}

function showCombatView() {
  document.getElementById("createOrJoin").style.display = "none";
  document.getElementById("playerSetup").style.display = "none";
  document.getElementById("combatView").style.display = "block";
  updateRoomCodeDisplay();
  
  if (isDM) {
      cargarMonstruosFrecuentes(); // Activa los botones de acceso rápido
      loadCustomBestiary();        // Descarga tu bestiario de Firebase
  }
  listenToCombat();
}

// --- LÓGICA DE PERSONAJES ---
// Reemplaza toda tu función submitCharacter actual por esta:
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

  if (!name || isNaN(init) || isNaN(maxHp) || maxHp <= 0) { 
    alert("Por favor, ingresa nombre, iniciativa y vida máxima válidos."); 
    return; 
  }
  if (isNaN(currentHp) || currentHp <= 0) { currentHp = maxHp; }

  // 1. Guardamos las preferencias en el navegador
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

  // 2. LÓGICA DE RECONEXIÓN: Revisamos si el jugador ya existe en la base de datos
  db.ref(`rooms/${roomId}/characters`).once("value", snapshot => {
    const characters = snapshot.val() || {};
    let existingPlayerId = null;

    // Buscamos ignorando mayúsculas y minúsculas
    for (const key in characters) {
      if (characters[key].name.toLowerCase() === name.toLowerCase() && !characters[key].isEnemy) {
        existingPlayerId = key;
        break;
      }
    }

    if (existingPlayerId) {
      // RECONEXIÓN: El jugador ya estaba, usamos su ID viejo
      playerId = existingPlayerId;
    } else {
      // JUGADOR NUEVO: Le creamos un ID nuevo
      playerId = 'PLAYER_' + generateId();
    }

    const newCharacter = {
      id: playerId, name, level, pClass, init, maxHp, currentHp,
      isEnemy: false, showHelper: showHelper,
      // Si reconecta, mantiene su inspiración y estatus de bloqueo
      inspiration: existingPlayerId && characters[existingPlayerId] ? characters[existingPlayerId].inspiration : 0,
      editLocked: existingPlayerId && characters[existingPlayerId] ? characters[existingPlayerId].editLocked : false,
      stats: stats,
      spellSlots: spellSlots
    };
    
    // 3. Subimos los datos finales y entramos al combate
    db.ref(`rooms/${roomId}/characters/${playerId}`).set(newCharacter).then(showCombatView);
  });
}

// --- LÓGICA DE ENEMIGOS Y API (BESTIARIO) ---
let currentEnemyStats = null;
let currentEnemyDexMod = 0;
let searchTimeout = null;

// Escuchador para el buscador de monstruos
document.getElementById('enemyName').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim().toLowerCase();
    const suggestionsBox = document.getElementById('monsterSuggestions');
    
    if (query.length === 0) {
        currentEnemyStats = null;
        currentEnemyDexMod = 0;
        document.getElementById("enemyDexDisplay").textContent = "+0";
        document.getElementById("enemyCR").value = "";
        suggestionsBox.style.display = 'none';
        return;
    }

    suggestionsBox.innerHTML = '<li style="padding: 8px 12px; color: #888;">Buscando...</li>';
    suggestionsBox.style.display = 'block';

    searchTimeout = setTimeout(() => {
        const customMatches = bestiarioCustom.filter(m => m.name.toLowerCase().includes(query));
        suggestionsBox.innerHTML = '';
        let foundAny = false;

        // 1. Mostrar los custom
        customMatches.forEach(monster => {
            foundAny = true;
            const li = document.createElement('li');
            li.style.cssText = 'padding: 8px 12px; cursor: pointer; color: #5db0c9; border-bottom: 1px solid #5a4b3a;';
            li.textContent = `⭐ ${monster.name} (HP: ${monster.hit_points} | CR: ${monster.challenge_rating || '?'})`;
            li.onmouseover = () => li.style.backgroundColor = '#2a231d';
            li.onmouseout = () => li.style.backgroundColor = 'transparent';
            li.onclick = () => selectMonster(monster);
            suggestionsBox.appendChild(li);
        });

        if (query.length < 3) {
            if (!foundAny) suggestionsBox.innerHTML = '<li style="padding: 8px 12px; color: #888;">Escribe más para buscar en el SRD...</li>';
            return;
        }

        // 2. Continuar con la API y agregarlos a la misma lista
        fetch(`https://api.open5e.com/v1/monsters/?name__icontains=${query}&limit=5`)
        .then(res => res.json())
        .then(data => {
            if(data.results && data.results.length > 0) {
                data.results.forEach(monster => {
                    const li = document.createElement('li');
                    li.style.cssText = 'padding: 8px 12px; cursor: pointer; color: #c9a45d; border-bottom: 1px solid #5a4b3a;';
                    li.textContent = `${monster.name} (HP: ${monster.hit_points} | CR: ${monster.challenge_rating})`;
                    li.onmouseover = () => li.style.backgroundColor = '#2a231d';
                    li.onmouseout = () => li.style.backgroundColor = 'transparent';
                    li.onclick = () => selectMonster(monster);
                    suggestionsBox.appendChild(li);
                });
            } else if (!foundAny) {
                suggestionsBox.innerHTML = '<li style="padding: 8px 12px; color: #ff4c4c;">No encontrado (Intenta en Inglés)</li>';
            }
        }).catch(err => {
            if (!foundAny) suggestionsBox.innerHTML = '<li style="padding: 8px 12px; color: #ff4c4c;">Error de conexión API</li>';
        });
    }, 400); 
});

// Cuando el DM hace clic en un monstruo de la lista
function selectMonster(monster) {
    document.getElementById('enemyName').value = monster.name;
    document.getElementById('enemyMaxHp').value = monster.hit_points;
    
    currentEnemyStats = {
        str: monster.strength,
        dex: monster.dexterity,
        con: monster.constitution,
        int: monster.intelligence,
        wis: monster.wisdom,
        cha: monster.charisma
    };
    
    currentEnemyDexMod = calculateModifier(monster.dexterity);
    const dexDisplay = document.getElementById('enemyDexDisplay');
    dexDisplay.textContent = (currentEnemyDexMod >= 0 ? '+' : '') + currentEnemyDexMod;
    
    document.getElementById('monsterSuggestions').style.display = 'none';
    document.getElementById('enemyCR').value = monster.challenge_rating || "?";
}

// Función modificada para añadir al enemigo con stats y TELEMETRÍA (Versión Estática Pareto)
let pendingMonster = null; // Variable temporal para el modal

function addEnemy() {
  if (!isDM) return;
  const name = document.getElementById("enemyName").value.trim();
  const rawRoll = parseInt(document.getElementById("enemyInit").value);
  const maxHp = parseInt(document.getElementById("enemyMaxHp").value);
  const crInput = document.getElementById("enemyCR").value.trim() || "0";
  
  if (!name || isNaN(rawRoll) || isNaN(maxHp) || maxHp <= 0) {
      alert("Por favor, ponle nombre, su tirada en el d20 y su vida.");
      return;
  }
  
  const finalInit = rawRoll + currentEnemyDexMod;
  const saveCheckbox = document.getElementById('saveCustomMonster');

  // Si decides guardar en tu bestiario, pausamos y abrimos el modal
  if (saveCheckbox && saveCheckbox.checked) {
      pendingMonster = { name, finalInit, maxHp, crInput };
      document.getElementById('customMonsterTitle').textContent = `Stats de ${name}`;
      
      const baseStats = currentEnemyStats || {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10};
      document.getElementById('customSTR').value = baseStats.str;
      document.getElementById('customDEX').value = baseStats.dex;
      document.getElementById('customCON').value = baseStats.con;
      document.getElementById('customINT').value = baseStats.int;
      document.getElementById('customWIS').value = baseStats.wis;
      document.getElementById('customCHA').value = baseStats.cha;

      document.getElementById('customMonsterModal').style.display = 'flex';
      return; 
  }
  
  // Si no está marcada la casilla, lo añadimos directo al combate
  const statsToSave = currentEnemyStats || {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10};
  executeMonsterAddition(name, finalInit, maxHp, crInput, statsToSave);
}

// Se ejecuta al darle clic a "Guardar y Añadir" en el modal
function finalizeCustomMonster() {
    if (!pendingMonster) return;

    const customStats = {
        str: parseInt(document.getElementById('customSTR').value) || 10,
        dex: parseInt(document.getElementById('customDEX').value) || 10,
        con: parseInt(document.getElementById('customCON').value) || 10,
        int: parseInt(document.getElementById('customINT').value) || 10,
        wis: parseInt(document.getElementById('customWIS').value) || 10,
        cha: parseInt(document.getElementById('customCHA').value) || 10
    };

    const customEntry = {
        name: pendingMonster.name,
        hit_points: pendingMonster.maxHp,
        challenge_rating: pendingMonster.crInput,
        strength: customStats.str, dexterity: customStats.dex, constitution: customStats.con,
        intelligence: customStats.int, wisdom: customStats.wis, charisma: customStats.cha
    };
    
    db.ref(`bestiario_custom/${pendingMonster.name.toUpperCase()}`).set(customEntry);

    executeMonsterAddition(pendingMonster.name, pendingMonster.finalInit, pendingMonster.maxHp, pendingMonster.crInput, customStats);
    
    document.getElementById('customMonsterModal').style.display = 'none';
    pendingMonster = null;
}

// Función centralizada que hace la subida a Firebase
function executeMonsterAddition(name, finalInit, maxHp, crInput, statsToSave) {
    const enemyId = 'ENEMY_' + generateId();
    const newEnemy = { 
        id: enemyId, name: name, init: finalInit, maxHp: maxHp, currentHp: maxHp, isEnemy: true,
        stats: statsToSave, cr: crInput
    };

    db.ref(`rooms/${roomId}/characters/${enemyId}`).set(newEnemy).then(() => {
        const nombreEstandarizado = name.toUpperCase();
        db.ref(`analytics/monstruos_usados/${nombreEstandarizado}`).once('value', snapshot => {
            const data = snapshot.val() || { count: 0 };
            db.ref(`analytics/monstruos_usados/${nombreEstandarizado}`).set({
                count: data.count + 1, 
                hp: maxHp, 
                dexMod: calculateModifier(statsToSave.dex),
                cr: crInput // <-- AÑADIMOS ESTA LÍNEA PARA GUARDAR EL CR
            });
        });

        document.getElementById("enemyName").value = "";
        document.getElementById("enemyInit").value = "";
        document.getElementById("enemyMaxHp").value = "";
        document.getElementById("enemyCR").value = "";
        document.getElementById("enemyDexDisplay").textContent = "+0";
        const saveCheckbox = document.getElementById('saveCustomMonster');
        if (saveCheckbox) saveCheckbox.checked = false;
        currentEnemyStats = null;
        currentEnemyDexMod = 0;
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
    // Detector de Recompensas al terminar combate
    if (data && data.reward) {
        const rewardModal = document.getElementById('rewardsModal');
        const rewardText = document.getElementById('rewardText');
        
        if (data.reward.levelUp) {
            rewardText.innerHTML = "¡SUBIDA DE NIVEL!<br><span style='font-size: 0.7em; color: #c9a45d;'>Prepárate para nuevas hazañas</span>";
        } else {
            rewardText.innerHTML = `¡Has ganado <span style="color: #c9a45d; font-weight: bold;">+${data.reward.xp} XP</span>!`;
        }
        
        rewardModal.style.display = 'flex';
        // Se ocultará solo tras 3 segundos
        setTimeout(() => { rewardModal.style.display = 'none'; }, 3000);
    }
    
    // 1. SI LA SALA YA NO EXISTE (El DM usó "Finalizar Combate")
    if (!data) { 
        alert("El DM ha finalizado el combate. La sala se ha cerrado."); 
        disconnectAndMenu(); // Limpiamos la sesión y mandamos al menú
        return; 
    }

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
    
    // Panel lateral
    if (characterToDisplay && !isDM) {
      renderCharacterPanel(characterToDisplay);
    } else {
      hideCharacterPanel();
    }

    // Recordatorio de turno
    const turnHelper = document.getElementById('turnHelper');
    if (amICurrentPlayer && myCharacter && myCharacter.showHelper) { turnHelper.style.display = 'block'; } 
    else { turnHelper.style.display = 'none'; }
    
    // 2. CONTROL DE VISIBILIDAD DE BOTONES
    document.getElementById('dmCombatControls').style.display = isDM ? 'block' : 'none';
    document.getElementById('startCombatBtn').style.display = isDM && !data.started ? 'inline-block' : 'none';
    document.getElementById('dmNextTurnBtn').style.display = isDM && data.started ? 'inline-block' : 'none';
    document.getElementById('playerEndTurnBtn').style.display = !isDM && data.started && amICurrentPlayer ? 'inline-block' : 'none';
    document.getElementById('endCombatBtn').style.display = isDM && data.started ? 'inline-block' : 'none';
    
    // Mostrar el botón de Abandonar Combate solo si NO es el DM
    const btnAbandonar = document.getElementById('btnAbandonarCombate');
    if(btnAbandonar) {
        btnAbandonar.style.display = !isDM ? 'inline-block' : 'none';
    }

    // 3. RENDERIZADO DE LA LISTA DE INICIATIVA
    const list = document.getElementById("initiativeList");
    list.innerHTML = "";
    
    if (!isDM && !data.started) { list.innerHTML = "<li>Esperando a que el DM inicie el combate...</li>"; } 
    else {
      const characters = data.characters ? Object.values(data.characters) : [];
      if (characters.length === 0) { list.innerHTML = `<li>${isDM ? 'Añade personajes para empezar...' : 'Esperando personajes...'}</li>`; } 
      else {
        sortCharacters(characters);
        updateDifficultyTracker(characters);
        characters.forEach(char => {
          const li = document.createElement("li");
          const container = document.createElement("div");
          container.style.display = "flex"; container.style.alignItems = "center"; container.style.width = "100%";
          const charInfo = document.createElement("div"); charInfo.className = "character-info";
          const charName = document.createElement("span"); charName.className = "character-name";
          
          const inspireCount = char.inspiration || 0;
          const inspireIcon = inspireCount > 0 ? `⭐(${inspireCount})` : ''; 
          charName.textContent = `${char.name} (${char.init}) ${inspireIcon}`;
          
          // --- VISTA COMPACTA DEL DM ---
          if (isDM) {
            charName.classList.add('character-name-clickable');
            charName.title = `Ver estadísticas de ${char.name}`;
            charName.onclick = () => {
              const existingStats = li.querySelector('.dm-compact-stats');
              if (existingStats) {
                  existingStats.remove(); 
              } else {
                  const stats = char.stats || {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10};
                  const f = (val) => { const m = calculateModifier(val); return (m >= 0 ? '+' : '') + m; };
                  
                  const statsBar = document.createElement('div');
                  statsBar.className = 'dm-compact-stats';
                  statsBar.innerHTML = `
                      <div>FUE <span>${f(stats.str)}</span></div>
                      <div>DES <span>${f(stats.dex)}</span></div>
                      <div>CON <span>${f(stats.con)}</span></div>
                      <div>INT <span>${f(stats.int)}</span></div>
                      <div>SAB <span>${f(stats.wis)}</span></div>
                      <div>CAR <span>${f(stats.cha)}</span></div>
                      <button class="close-compact-btn" title="Cerrar" onclick="this.parentElement.remove(); event.stopPropagation();">[x]</button>
                  `;
                  li.appendChild(statsBar);
              }
            };
          }
          
          // Clic del jugador en su propio nombre
          if (char.id === playerId && !isDM) {
              charName.classList.add('character-name-clickable');
              charName.title = `Ver mi panel`;
              charName.onclick = () => {
                  isPlayerPanelOpen = true;
                  renderCharacterPanel(char);
              };
          }
          
          charInfo.appendChild(charName);
          
          // Barra de Vida
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

          // Texto de Vida
          if (canSeeHp) {
            const hpDisplay = document.createElement("div");
            hpDisplay.className = "hp-text-container";
            hpDisplay.textContent = `${char.currentHp} / ${char.maxHp}`;
            hpDisplay.onclick = () => openHpModal(char.id, char.name, char.currentHp);
            container.appendChild(hpDisplay);
          }

          // Iconos de acción del jugador
          if (char.id === playerId && myCharacter && myCharacter.showHelper) {
            const iconsContainer = document.createElement('div');
            iconsContainer.className = 'action-icons';
            iconsContainer.innerHTML = `<span class="action-icon" title="Acción" onclick="toggleAction(this)">⚔️</span><span class="action-icon" title="Acción Adicional" onclick="toggleAction(this)">✨</span><span class="action-icon" title="Movimiento" onclick="toggleAction(this)">🏃</span>`;
            container.appendChild(iconsContainer);
          }

          // Botones del DM (Candado, Inspiración, Eliminar)
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

    // 4. DISPLAY DEL TURNO ACTUAL
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
      sortCharacters(characters);
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
    sortCharacters(characters);
    const currentIndex = data.currentCharacterId ? characters.findIndex(c => c.id === data.currentCharacterId) : -1;
    const nextIndex = (currentIndex + 1) % characters.length;
    db.ref(`rooms/${roomId}`).update({ currentCharacterId: characters[nextIndex].id });
  });
}

function endCombat() {
  if (!isDM) return;
  
  // 1. Calculamos la XP total de los monstruos que estaban en el combate
  db.ref(`rooms/${roomId}/characters`).once('value', snapshot => {
    const data = snapshot.val() || {};
    let totalMonstersXP = 0;
    let monsterCount = 0;

    Object.values(data).forEach(char => {
      if (char.isEnemy) {
        monsterCount++;
        totalMonstersXP += (xpByCR[char.cr || "0"] || 0);
      }
    });

    if (monsterCount === 0) {
      if (confirm("¿Finalizar el combate? (No había monstruos para calcular XP).")) {
        executeEndCombatSequence(0, false);
      }
      return;
    }

    // 2. Preguntamos al DM
    const darXp = confirm(`Los monstruos derrotados otorgan un total de ${totalMonstersXP} XP.\n\n¿Deseas repartir esta experiencia automáticamente a los jugadores?\n(Presiona Cancelar si prefieres dar Subida de Nivel / LVL UP)`);

    if (darXp) {
      executeEndCombatSequence(totalMonstersXP, false);
    } else {
      const subirNivel = confirm("¿Quieres enviar una alerta general de ¡LVL UP! a todos los jugadores?");
      if (subirNivel) {
        executeEndCombatSequence(0, true);
      }
    }
  });
}

function executeEndCombatSequence(xpAmount, isLevelUp) {
  // Escribimos la recompensa en la base de datos de la sala antes de borrarla
  db.ref(`rooms/${roomId}/reward`).set({
    xp: xpAmount,
    levelUp: isLevelUp,
    timestamp: Date.now()
  }).then(() => {
    // Damos un margen de 3.5 segundos para que los jugadores alcancen a ver el aviso antes de cerrar la sala
    setTimeout(() => {
      db.ref(`rooms/${roomId}`).remove().then(() => {
        disconnectAndMenu();
      });
    }, 3500);
  });
}

function abandonarCombate() {
  if (confirm("¿Seguro que quieres abandonar el combate? Tu personaje desaparecerá de la sala.")) {
      if (roomId && playerId && !isDM) {
          // Eliminamos específicamente a este personaje de la tabla del DM
          db.ref(`rooms/${roomId}/characters/${playerId}`).remove().then(() => {
              disconnectAndMenu();
          });
      } else {
          disconnectAndMenu();
      }
  }
}

// --- INICIALIZACIÓN FASE 3: Auto-Reconexión de Jugadores ---
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById("createOrJoin").style.display = "block";
  checkForExistingSession(); // Revisa si era DM
  
  // Revisa si hay una sala de jugador guardada de antes
  const lastRoom = localStorage.getItem('dnd_lastRoom');
  if (lastRoom) {
      const savedPlayerId = localStorage.getItem('dnd_room_' + lastRoom);
      if (savedPlayerId) {
          console.log("Intentando auto-reconexión a sala:", lastRoom);
          document.getElementById("roomCodeInput").value = lastRoom;
          joinRoom(); // Utiliza la lógica existente para validar que la sala sigue viva
      }
  }
});
// --- FUNCIÓN DE ACCESO RÁPIDO (Basada en Pareto) ---
function quickAddMonster(name, hp, dexMod, cr = "") {
    document.getElementById('enemyName').value = name;
    document.getElementById('enemyMaxHp').value = hp;
    document.getElementById('enemyCR').value = cr; // <-- METEMOS EL CR EN SU CASILLA
    
    // Le pasamos estadísticas promedio de esos monstruos
    currentEnemyStats = {str: 10, dex: 10 + (dexMod * 2), con: 10, int: 10, wis: 10, cha: 10};
    currentEnemyDexMod = dexMod;
    
    document.getElementById('enemyDexDisplay').textContent = (dexMod >= 0 ? '+' : '') + dexMod;
    
    // Enfocamos automáticamente la casilla del d20
    document.getElementById('enemyInit').focus();
}
