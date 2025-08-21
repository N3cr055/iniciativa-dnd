const firebaseConfig = {
  apiKey: "AIzaSyAgmLWiIGIFcLxG7OIu_SIlKn6WAkrdVrs",
  authDomain: "iniciativadnd.firebaseapp.com",
  databaseURL: "https://iniciativadnd-default-rtdb.firebaseio.com", // 🔹 esto es importante
  projectId: "iniciativadnd",
  storageBucket: "iniciativadnd.firebasestorage.app",
  messagingSenderId: "639360670200",
  appId: "1:639360670200:web:0861ccb49cf9a522135e0d"
};

// Inicializa Firebase con la versión "compat"
firebase.initializeApp(firebaseConfig);
const db = firebase.database();


let roomId = "";
let isDM = false;
let currentTurn = 0;

function createRoom() {
  roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
  db.ref(`rooms/${roomId}`).set({ players: [], enemies: [], started: false });
  isDM = true;
  alert(`Sala creada: ${roomId}`);
  document.getElementById("createOrJoin").style.display = "none";
  document.getElementById("dmControls").style.display = "block";
}

function joinRoom() {
  roomId = document.getElementById("roomCodeInput").value.toUpperCase();
  db.ref(`rooms/${roomId}`).once("value", snapshot => {
    if (snapshot.exists()) {
      document.getElementById("createOrJoin").style.display = "none";
      document.getElementById("playerSetup").style.display = "block";
    } else {
      alert("Sala no encontrada.");
    }
  });
}

function submitInitiative() {
  const name = document.getElementById("playerName").value;
  const init = parseInt(document.getElementById("playerInit").value);
  db.ref(`rooms/${roomId}/players`).push({ name, init });
  document.getElementById("playerSetup").style.display = "none";
  document.getElementById("combatView").style.display = "block";
  listenToCombat();
}

function addEnemy() {
  const name = document.getElementById("enemyName").value;
  const init = parseInt(document.getElementById("enemyInit").value);
  db.ref(`rooms/${roomId}/enemies`).push({ name, init });
}

function startCombat() {
  db.ref(`rooms/${roomId}`).update({ started: true, currentTurn: 0 });
  document.getElementById("dmControls").style.display = "none";
  document.getElementById("combatView").style.display = "block";
  document.getElementById("nextTurnBtn").style.display = "inline-block";
  listenToCombat();
}

function listenToCombat() {
  db.ref(`rooms/${roomId}`).on("value", snapshot => {
    const data = snapshot.val();
    if (!data) return;

    const all = [];
    if (data.players) {
      for (const p of Object.values(data.players)) {
        all.push({ name: p.name, init: p.init });
      }
    }
    if (data.enemies) {
      for (const e of Object.values(data.enemies)) {
        all.push({ name: e.name, init: e.init });
      }
    }

    all.sort((a, b) => b.init - a.init);
    const list = document.getElementById("initiativeList");
    list.innerHTML = "";

    all.forEach((char, i) => {
      const li = document.createElement("li");
      li.textContent = `${char.name} (${char.init})`;
      if (i === data.currentTurn) {
        li.style.fontWeight = "bold";
        document.getElementById("turnDisplay").textContent = `🎯 Turno de: ${char.name}`;
      }
      list.appendChild(li);
    });
  });
}

function nextTurn() {
  db.ref(`rooms/${roomId}/currentTurn`).once("value", snapshot => {
    let turn = snapshot.val() || 0;
    db.ref(`rooms/${roomId}/players`).once("value", playerSnap => {
      db.ref(`rooms/${roomId}/enemies`).once("value", enemySnap => {
        const total = playerSnap.numChildren() + enemySnap.numChildren();
        turn = (turn + 1) % total;
        db.ref(`rooms/${roomId}`).update({ currentTurn: turn });
      });
    });
  });
}
