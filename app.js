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
try {
  firebase.initializeApp(firebaseConfig);
  console.log("Firebase inicializado correctamente");
} catch (error) {
  console.error("Error inicializando Firebase:", error);
  alert("Error de configuración de Firebase. Contacta al administrador.");
}

const db = firebase.database();

// Verificar conexión
db.ref('.info/connected').on('value', function(snapshot) {
  if (snapshot.val() === true) {
    console.log("✅ Conectado a Firebase");
  } else {
    console.log("❌ Desconectado de Firebase");
  }
});

let roomId = "";
let isDM = false;
let combatListener = null;
let isCombatListening = false;

// Función para mostrar código de sala - VERSIÓN CORREGIDA
function updateRoomCodeDisplay() {
  const roomCodeDisplayElem = document.getElementById('roomCodeDisplay');
  if (roomCodeDisplayElem) {
    roomCodeDisplayElem.textContent = roomId;
  }

  // La línea para 'dmRoomCode' ha sido eliminada porque ya no existe en el HTML.

  const combatRoomCodeElem = document.getElementById('combatRoomCode');
  if (combatRoomCodeElem) {
    combatRoomCodeElem.textContent = roomId;
  }
}

// Función para copiar código de sala
function copyRoomCode() {
  navigator.clipboard.writeText(roomId)
    .then(() => alert('Código copiado: ' + roomId))
    .catch(err => console.error('Error al copiar:', err));
}

// Función para limpiar listeners
function cleanupListeners() {
  if (combatListener && roomId) {
    db.ref(`rooms/${roomId}`).off("value", combatListener);
  }
  combatListener = null;
  isCombatListening = false;
}

// Crear sala (DM) - VERSIÓN CORREGIDA
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
    // Va directo a la vista de combate unificada
    document.getElementById("combatView").style.display = "block"; 
    updateRoomCodeDisplay();
    // Inicia el listener de inmediato para el DM
    listenToCombat(); 
  }).catch(error => {
    console.error("Error creando sala:", error);
    alert("Error al crear sala. Verifica la conexión.");
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
      updateRoomCodeDisplay();
    } else {
      alert("Sala no encontrada.");
    }
  }).catch(error => {
    console.error("Error uniéndose a sala:", error);
    alert("Error al unirse a la sala.");
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
  
  db.ref(`rooms/${roomId}/players`).push({ name, init })
    .then(() => {
      document.getElementById("playerSetup").style.display = "none";
      document.getElementById("combatView").style.display = "block";
      updateRoomCodeDisplay();
      
      if (!isCombatListening) {
        listenToCombat();
      }
    })
    .catch(error => {
      console.error("Error enviando iniciativa:", error);
      alert("Error al enviar iniciativa.");
    });
}

// Agregar enemigo (DM)
function addEnemy() {
  const name = document.getElementById("enemyName").value.trim();
  const init = parseInt(document.getElementById("enemyInit").value);
  
  if (!name || isNaN(init)) {
    alert("Por favor ingresa un nombre y iniciativa válidos");
    return;
  }
  
  db.ref(`rooms/${roomId}/enemies`).push({ name, init })
    .then(() => {
      document.getElementById("enemyName").value = "";
      document.getElementById("enemyInit").value = "";
    })
    .catch(error => {
      console.error("Error agregando enemigo:", error);
      alert("Error al agregar enemigo.");
    });
}

// Iniciar combate (DM) - VERSIÓN SIMPLIFICADA
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
    
    // La única tarea es actualizar el estado en Firebase.
    // El listener se encargará de los cambios visuales.
    db.ref(`rooms/${roomId}`).update({ 
      started: true, 
      currentCharacter: null 
    }).catch(error => {
      console.error("Error iniciando combate:", error);
      alert("Error al iniciar combate.");
    });
  });
}

// Función para eliminar personaje
function removeCharacter(characterId, characterType) {
  if (!isDM) return;
  
  if (confirm("¿Estás seguro de eliminar este personaje?")) {
    console.log("Intentando eliminar:", characterId, "de", characterType);
    
    const characterRef = db.ref(`rooms/${roomId}/${characterType}/${characterId}`);
    
    characterRef.remove()
      .then(() => {
        console.log("✅ Solicitud de eliminación enviada");
      })
      .catch(error => {
        console.error("❌ Error al eliminar:", error);
      });
  }
}

// Función para editar iniciativa (solo DM)
function editInitiative(characterId, characterType, currentInit) {
  if (!isDM) return;
  
  const newInit = prompt("Ingresa la nueva iniciativa:", currentInit);
  if (newInit !== null && !isNaN(newInit)) {
    db.ref(`rooms/${roomId}/${characterType}/${characterId}/init`).set(parseInt(newInit))
      .catch(error => {
        console.error("Error al actualizar:", error);
        alert("Error al actualizar iniciativa.");
      });
  }
}

// Escuchar cambios de combate - VERSIÓN FINAL CORREGIDA
function listenToCombat() {
  // Eliminamos la bandera 'isCombatListening' que causaba problemas.
  // Ahora nos aseguramos de limpiar el listener anterior antes de poner uno nuevo.
  if (combatListener) {
    db.ref(`rooms/${roomId}`).off("value", combatListener);
  }
  
  combatListener = function(snapshot) {
    const data = snapshot.val();
    if (!data) {
      backToMenu();
      alert("La sala ha sido cerrada.");
      return;
    }

    // --- LÓGICA DE VISIBILIDAD DE CONTROLES DEL DM ---
    const dmCombatControls = document.getElementById('dmCombatControls');
    const startCombatBtn = document.getElementById('startCombatBtn');
    const nextTurnBtn = document.getElementById('nextTurnBtn');

    if (isDM) {
      // El formulario para añadir enemigos siempre es visible para el DM
      dmCombatControls.style.display = 'block'; 

      if (data.started) {
        // Si el combate empezó, muestra "Siguiente Turno"
        startCombatBtn.style.display = 'none';
        nextTurnBtn.style.display = 'inline-block';
      } else {
        // Si el combate NO ha empezado, muestra "Iniciar Combate"
        startCombatBtn.style.display = 'inline-block';
        nextTurnBtn.style.display = 'none';
      }
    } else {
      // Los jugadores nunca ven estos controles
      dmCombatControls.style.display = 'none';
      startCombatBtn.style.display = 'none';
      nextTurnBtn.style.display = 'none';
    }
    // --- FIN DE LA LÓGICA DE VISIBILIDAD ---

    const allCharacters = [];
    
    if (data.players && typeof data.players === 'object') {
      Object.entries(data.players).forEach(([id, player]) => {
        if (player && player.name && player.init !== undefined) {
          allCharacters.push({ id, name: player.name, init: parseInt(player.init) || 0, type: 'player' });
        }
      });
    }
    
    if (data.enemies && typeof data.enemies === 'object') {
      Object.entries(data.enemies).forEach(([id, enemy]) => {
        if (enemy && enemy.name && enemy.init !== undefined) {
          allCharacters.push({ id, name: enemy.name, init: parseInt(enemy.init) || 0, type: 'enemy' });
        }
      });
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
    
    if (currentCharacterName && allCharacters.length > 0) {
      const currentCharExists = allCharacters.some(char => char.name === currentCharacterName);
      if (!currentCharExists) {
        currentCharacterName = allCharacters[0].name;
        db.ref(`rooms/${roomId}`).update({ currentCharacter: currentCharacterName });
        return;
      }
    }
    
    allCharacters.forEach(char => {
      const li = document.createElement("li");
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.justifyContent = "space-between";
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
      
      if (isDM) {
        charText.style.cursor = "pointer";
        charText.title = "Click para editar iniciativa";
        charText.onclick = (e) => {
          e.stopPropagation();
          const characterType = char.type === 'player' ? 'players' : 'enemies';
          editInitiative(char.id, characterType, char.init);
        };
      }
      
      container.appendChild(charText);
      
      if (isDM) {
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "❌";
        deleteBtn.className = "delete-btn";
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          const characterType = char.type === 'player' ? 'players' : 'enemies';
          removeCharacter(char.id, characterType);
        };
        deleteBtn.title = "Eliminar personaje";
        container.appendChild(deleteBtn);
      }
      
      li.appendChild(container);
      
      if (char.type === 'enemy') {
        li.classList.add("enemy");
      }
      
      list.appendChild(li);
    });
    
    if (currentCharacterName) {
      document.getElementById("turnDisplay").textContent = `🎯 Turno de: ${currentCharacterName}`;
    } else if (allCharacters.length > 0) {
        document.getElementById("turnDisplay").textContent = "Combate listo para iniciar.";
    } else {
        document.getElementById("turnDisplay").textContent = "Añade personajes para empezar.";
    }
  };
  
  db.ref(`rooms/${roomId}`).on("value", combatListener);
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
          allCharacters.push({ name: player.name, init: player.init || 0 });
        }
      });
    }
    
    if (data.enemies) {
      Object.values(data.enemies).forEach(enemy => {
        if (enemy && enemy.name) {
          allCharacters.push({ name: enemy.name, init: enemy.init || 0 });
        }
      });
    }
    
    if (allCharacters.length === 0) {
      db.ref(`rooms/${roomId}`).update({ currentCharacter: null });
      return;
    }
    
    allCharacters.sort((a, b) => b.init - a.init);
    
    let currentIndex = -1;
    if (data.currentCharacter) {
      currentIndex = allCharacters.findIndex(c => c.name === data.currentCharacter);
    }
    
    currentIndex = (currentIndex + 1) % allCharacters.length;
    
    const nextCharacter = allCharacters[currentIndex].name;
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