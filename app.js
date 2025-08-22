const firebaseConfig = {
  apiKey: "AIzaSyAgmLWiIGIFcxG7OIu_SIlKn6WAkrdVrs",
  authDomain: "iniciativadnd.firebaseapp.com",
  databaseURL: "https://iniciativadnd-default-rtdb.firebaseio.com",
  projectId: "iniciativadnd",
  storageBucket: "iniciativadnd.firebasestorage.app",
  messagingSenderId: "639360670200",
  appId: "1:639360670200:web:0861ccb49cf9a522135e0"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let roomId = "";
let isDM = false;
let combatListener = null;
let isCombatListening = false;

// Función para limpiar listeners
function cleanupListeners() {
  if (combatListener) {
    db.ref(`rooms/${roomId}`).off("value", combatListener);
    combatListener = null;
  }
  isCombatListening = false;
  console.log("Listener removido");
}

// Crear sala (DM)
function createRoom() {
  cleanupListeners();
  roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
  db.ref(`rooms/${roomId}`).set({ 
    players: {}, 
    enemies: {}, 
    started: false, 
    currentCharacter: null 
  }).then(() => {
    isDM = true;
    alert(`Sala creada: ${roomId}`);
    document.getElementById("createOrJoin").style.display = "none";
    document.getElementById("dmControls").style.display = "block";
  });
}

// Unirse a sala
function joinRoom() {
  cleanupListeners();
  roomId = document.getElementById("roomCodeInput").value.toUpperCase();
  if (!roomId) {
    alert("Por favor ingresa un código de sala");
    return;
  }
  
  db.ref(`rooms/${roomId}`).once("value", snapshot => {
    if (snapshot.exists()) {
      document.getElementById("createOrJoin").style.display = "none";
      document.getElementById("playerSetup").style.display = "block";
    } else {
      alert("Sala no encontrada.");
    }
  });
}

// Enviar iniciativa jugador
function submitInitiative() {
  const name = document.getElementById("playerName").value.trim();
  const init = parseInt(document.getElementById("playerInit").value);
  
  if (!name || isNaN(init)) {
    alert("Por favor ingresa un nombre y iniciativa válidos");
    return;
  }
  
  db.ref(`rooms/${roomId}/players`).push({ name, init });
  document.getElementById("playerSetup").style.display = "none";
  document.getElementById("combatView").style.display = "block";
  
  if (!isCombatListening) {
    listenToCombat();
  }
}

// Agregar enemigo (DM)
function addEnemy() {
  const name = document.getElementById("enemyName").value.trim();
  const init = parseInt(document.getElementById("enemyInit").value);
  
  if (!name || isNaN(init)) {
    alert("Por favor ingresa un nombre y iniciativa válidos");
    return;
  }
  
  db.ref(`rooms/${roomId}/enemies`).push({ name, init });
  document.getElementById("enemyName").value = "";
  document.getElementById("enemyInit").value = "";
}

// Iniciar combate (DM)
function startCombat() {
  db.ref(`rooms/${roomId}`).once("value", snapshot => {
    const data = snapshot.val();
    if (!data) return;
    
    const playerCount = data.players ? Object.keys(data.players).length : 0;
    const enemyCount = data.enemies ? Object.keys(data.enemies).length : 0;
    
    if (playerCount === 0 && enemyCount === 0) {
      alert("Agrega al menos un jugador o enemigo antes de iniciar el combate");
      return;
    }
    
    db.ref(`rooms/${roomId}`).update({ 
      started: true, 
      currentCharacter: null 
    });
    
    document.getElementById("dmControls").style.display = "none";
    document.getElementById("combatView").style.display = "block";
    document.getElementById("nextTurnBtn").style.display = "inline-block";
    
    if (!isCombatListening) {
      listenToCombat();
    }
  });
}

// Escuchar cambios de combate - VERSIÓN CORREGIDA
function listenToCombat() {
  if (isCombatListening) {
    console.log("Listener ya está activo, ignorando llamada duplicada");
    return;
  }
  
  console.log("Iniciando listener de combate...");
  isCombatListening = true;
  
  // SOLO limpiar el listener anterior, no llamar a cleanupListeners() completo
  if (combatListener) {
    db.ref(`rooms/${roomId}`).off("value", combatListener);
    combatListener = null;
  }
  
  combatListener = db.ref(`rooms/${roomId}`).on("value", snapshot => {
    const data = snapshot.val();
    if (!data) {
      console.log("No data found for room:", roomId);
      return;
    }

    console.log("Datos recibidos, procesando...");
    
    // Construir lista completa de personajes
    const allCharacters = [];
    
    // Procesar jugadores
    if (data.players && typeof data.players === 'object') {
      Object.entries(data.players).forEach(([id, player]) => {
        if (player && player.name) {
          allCharacters.push({
            id: id,
            name: player.name,
            init: player.init || 0,
            type: 'player'
          });
        }
      });
    }
    
    // Procesar enemigos
    if (data.enemies && typeof data.enemies === 'object') {
      Object.entries(data.enemies).forEach(([id, enemy]) => {
        if (enemy && enemy.name) {
          allCharacters.push({
            id: id,
            name: enemy.name,
            init: enemy.init || 0,
            type: 'enemy'
          });
        }
      });
    }
    
    // Eliminar duplicados por ID
    const uniqueCharacters = [];
    const seenIds = new Set();
    
    allCharacters.forEach(char => {
      if (char.id && !seenIds.has(char.id)) {
        seenIds.add(char.id);
        uniqueCharacters.push(char);
      }
    });
    
    // Ordenar por iniciativa descendente
    uniqueCharacters.sort((a, b) => b.init - a.init);
    
    const list = document.getElementById("initiativeList");
    list.innerHTML = "";
    
    // Determinar personaje activo
    let currentCharacterName = data.currentCharacter;
    if (!currentCharacterName && uniqueCharacters.length > 0) {
      currentCharacterName = uniqueCharacters[0].name;
      db.ref(`rooms/${roomId}`).update({ currentCharacter: currentCharacterName });
      return; // Salir temprano para evitar renderizado duplicado
    }
    
    // Renderizar la lista UNA SOLA VEZ
    uniqueCharacters.forEach(char => {
      const li = document.createElement("li");
      
      if (char.name === currentCharacterName) {
        li.innerHTML = `🎯 <strong>${char.name} (${char.init})</strong>`;
        li.classList.add("current-turn");
      } else {
        li.textContent = `${char.name} (${char.init})`;
      }
      
      if (char.type === 'enemy') {
        li.classList.add("enemy");
      }
      
      list.appendChild(li);
    });
    
    if (currentCharacterName) {
      document.getElementById("turnDisplay").textContent = `🎯 Turno de: ${currentCharacterName}`;
    }
  });
}

// Siguiente turno
function nextTurn() {
  db.ref(`rooms/${roomId}`).once("value", snapshot => {
    const data = snapshot.val();
    if (!data) return;

    const allCharacters = [];
    
    if (data.players) {
      Object.values(data.players).forEach(player => {
        if (player && player.name) {
          allCharacters.push({
            name: player.name,
            init: player.init || 0
          });
        }
      });
    }
    
    if (data.enemies) {
      Object.values(data.enemies).forEach(enemy => {
        if (enemy && enemy.name) {
          allCharacters.push({
            name: enemy.name,
            init: enemy.init || 0
          });
        }
      });
    }
    
    if (allCharacters.length === 0) return;
    
    allCharacters.sort((a, b) => b.init - a.init);
    
    let currentIndex = allCharacters.findIndex(c => c.name === data.currentCharacter);
    if (currentIndex === -1) currentIndex = 0;
    
    const nextIndex = (currentIndex + 1) % allCharacters.length;
    const nextCharacter = allCharacters[nextIndex].name;
    
    db.ref(`rooms/${roomId}`).update({ currentCharacter: nextCharacter });
  });
}

// Función para volver al menú principal
function backToMenu() {
  cleanupListeners();
  roomId = "";
  isDM = false;
  document.getElementById("dmControls").style.display = "none";
  document.getElementById("playerSetup").style.display = "none";
  document.getElementById("combatView").style.display = "none";
  document.getElementById("nextTurnBtn").style.display = "none";
  document.getElementById("createOrJoin").style.display = "block";
  
  document.getElementById("roomCodeInput").value = "";
  document.getElementById("playerName").value = "";
  document.getElementById("playerInit").value = "";
  document.getElementById("enemyName").value = "";
  document.getElementById("enemyInit").value = "";
}

// Limpiar al cerrar
window.addEventListener('beforeunload', cleanupListeners);
