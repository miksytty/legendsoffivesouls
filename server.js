const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const players = {}, enemies = [], projectiles = [], items = [];
let npc = { id: 'npc1', x: 500, y: 500, dialog: 'Убей 3 волков!' };
const MAX_PLAYERS = 100, MAX_PROJECTILES = 100, MAX_ENEMIES = 5, MAX_ITEMS = 5;

wss.on('connection', ws => {
    if (Object.keys(players).length >= MAX_PLAYERS) {
        ws.close();
        return;
    }

    const playerId = uuidv4();
    players[playerId] = { id: playerId, x: 100, y: 100, classType: null, inventory: Array(10).fill(null), questProgress: 0 };
    console.log(`Player ${playerId} connected`);

    ws.send(JSON.stringify({ type: 'init', playerId, players, enemies, items, npc }));
    broadcast({ type: 'playerJoined', player: players[playerId] }, playerId);

    ws.on('message', data => {
        const msg = JSON.parse(data);
        if (msg.type === 'selectClass') {
            players[playerId].classType = msg.classType;
            broadcast({ type: 'playerUpdate', player: players[playerId] });
        } else if (msg.type === 'move') {
            players[playerId].x = msg.x;
            players[playerId].y = msg.y;
            broadcast({ type: 'playerUpdate', player: players[playerId] });
        } else if (msg.type === 'shoot' && projectiles.length < MAX_PROJECTILES) {
            const proj = { id: uuidv4(), x: msg.x, y: msg.y, angle: msg.angle, owner: playerId };
            projectiles.push(proj);
            broadcast({ type: 'projectile', projectile: proj });
        } else if (msg.type === 'pickup' && players[playerId]) {
            const item = items.find(i => i.id === msg.itemId);
            if (item && Math.hypot(players[playerId].x - item.x, players[playerId].y - item.y) < 50) {
                const slot = players[playerId].inventory.findIndex(s => !s);
                if (slot !== -1) {
                    players[playerId].inventory[slot] = item.type;
                    items.splice(items.indexOf(item), 1);
                    broadcast({ type: 'itemPicked', itemId: item.id, playerId });
                }
            }
        } else if (msg.type === 'chat') {
            broadcast({ type: 'chat', playerId, message: msg.message });
        } else if (msg.type === 'enemyKilled') {
            const enemy = enemies.find(e => e.id === msg.enemyId);
            if (enemy) {
                enemies.splice(enemies.indexOf(enemy), 1);
                players[playerId].questProgress++;
                broadcast({ type: 'enemyKilled', enemyId: msg.enemyId, playerId });
            }
        }
    });

    ws.on('close', () => {
        delete players[playerId];
        broadcast({ type: 'playerLeft', playerId });
        console.log(`Player ${playerId} disconnected`);
    });
});

function broadcast(data, excludeId) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && (!excludeId || players[excludeId] !== client)) {
            client.send(JSON.stringify(data));
        }
    });
}

setInterval(() => {
    if (enemies.length < MAX_ENEMIES) {
        const enemy = { id: uuidv4(), x: Math.random() * 1000, y: Math.random() * 1000, type: 'wolf', health: 100 };
        enemies.push(enemy);
        broadcast({ type: 'enemySpawn', enemy });
    }
    if (items.length < MAX_ITEMS) {
        const item = { id: uuidv4(), x: Math.random() * 1000, y: Math.random() * 1000, type: ['gold', 'potion'][Math.floor(Math.random() * 2)] };
        items.push(item);
        broadcast({ type: 'itemSpawn', item });
    }
    projectiles.forEach(proj => {
        proj.x += Math.cos(proj.angle) * 5;
        proj.y += Math.sin(proj.angle) * 5;
        enemies.forEach(enemy => {
            if (Math.hypot(proj.x - enemy.x, proj.y - enemy.y) < 20) {
                enemy.health -= 25;
                if (enemy.health <= 0) {
                    const playerId = proj.owner;
                    if (players[playerId]) {
                        players[playerId].questProgress++;
                        broadcast({ type: 'enemyKilled', enemyId: enemy.id, playerId });
                    }
                    enemies.splice(enemies.indexOf(enemy), 1);
                }
                projectiles.splice(projectiles.indexOf(proj), 1);
                broadcast({ type: 'projectileHit', projectileId: proj.id });
            }
        });
    });
}, 1000);

console.log(`Сервер запущен на порту ${process.env.PORT || 8080}`);
