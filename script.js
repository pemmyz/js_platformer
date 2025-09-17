// IIFE to encapsulate game logic
(function() {
    // --- PHYSICS CONSTANTS ---
    const PPM = 32;
    const GRAVITY = -20;
    const TIME_STEP = 1 / 60;
    const MAX_VELOCITY = 8;
    const MOVE_FORCE = 35.0;
    const JUMP_IMPULSE = 19.5;
    const PLAYER_DAMPING = 2.0;

    // Planck.js alias
    const pl = planck;
    const Vec2 = pl.Vec2;

    // Canvas & Context
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 450;

    // Physics World
    const world = pl.World({ gravity: Vec2(0, GRAVITY) });

    // Game State
    let players = [];
    let enemies = [];
    let blocks = [];
    let powerups = [];
    let gameTime = 400;
    let gameOver = false;
    let lastTime = 0;
    let levelWidthInPixels = 0;

    // Input State
    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);

    // --- UTILITY FUNCTIONS ---
    const m2p = (m) => m * PPM;
    const p2m = (p) => p / PPM;
    const formatNumber = (num, length) => String(num).padStart(length, '0');

    // --- CAMERA ---
    const camera = {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
        update: function() {
            if (players.length === 0) return;
            let totalX = 0;
            players.forEach(p => totalX += p.body.getPosition().x);
            const avgX = totalX / players.length;
            let targetX = m2p(avgX) - this.width / 2;
            this.x += (targetX - this.x) * 0.1;
            
            if (this.x < 0) this.x = 0;
            if (levelWidthInPixels > this.width && this.x > levelWidthInPixels - this.width) {
                this.x = levelWidthInPixels - this.width;
            }
        }
    };

    // --- ORIGINAL HARD-CODED LEVEL DATA ---
    const originalLevelData = [ 
        "                                        ", 
        "                                        ", 
        "                                        ", 
        "                                        ", 
        "                                        ", 
        "    ?#?#                                ", 
        "                                        ", 
        "                E         E             ", 
        "       #####         ####               ", 
        "                                        ", 
        "              E   E                     ", 
        "   ?##?      #####                      ", 
        "                                        ", 
        "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", 
        "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS" 
    ];

    // --- NEW PROCEDURAL PLATFORM GENERATOR ---
    const RandomPlatformGenerator = {
        generateLevelData(levelWidth, levelHeight, platformCount) {
            // 1. Create an empty grid
            const levelMap = Array.from({ length: levelHeight }, () => Array(levelWidth).fill(' '));

            // 2. Add solid ground at the bottom
            for (let c = 0; c < levelWidth; c++) {
                levelMap[levelHeight - 2][c] = 'G'; // Green ground
                levelMap[levelHeight - 1][c] = 'S'; // Solid invisible block
            }

            // 3. Place random platforms
            for (let i = 0; i < platformCount; i++) {
                const platWidth = Math.floor(Math.random() * 6) + 2; // Random width 2 to 7
                const platX = Math.floor(Math.random() * (levelWidth - platWidth));
                const platY = Math.floor(Math.random() * (levelHeight - 5)) + 2; // Avoid top and bottom rows

                const platType = Math.random() > 0.3 ? '#' : '?'; // 70% brick, 30% question

                for (let j = 0; j < platWidth; j++) {
                    levelMap[platY][platX + j] = platType;
                }
            }
            
            // 4. Place enemies on top of platforms
            const enemyDensity = 0.1; // 10% chance to spawn on a platform block
            for (let r = 1; r < levelHeight - 2; r++) {
                for (let c = 0; c < levelWidth; c++) {
                    const tileBelow = levelMap[r+1][c];
                    const currentTile = levelMap[r][c];

                    if(currentTile === ' ' && (tileBelow === '#' || tileBelow === '?')) {
                        if (Math.random() < enemyDensity) {
                            levelMap[r][c] = 'E';
                        }
                    }
                }
            }

            return levelMap;
        }
    };

    // --- CLASSES (Player, Enemy, Block, PowerUp are unchanged) ---
    class Player {
        constructor(world, x, y, playerNumber) {
            this.playerNumber = playerNumber;
            this.width = p2m(26);
            this.height = p2m(28);
            this.body = world.createDynamicBody({
                position: Vec2(x, y),
                fixedRotation: true,
                allowSleep: false,
                linearDamping: PLAYER_DAMPING,
            });

            this.body.createFixture(pl.Box(this.width / 2, this.height / 2), {
                density: 1.0,
                friction: 0.9,
            });
            
            this.body.setUserData({type: 'player', player: this});

            this.jumpCooldown = 0;
            this.score = 0;
            this.coins = 0;
            this.lives = 3;
            this.isBig = false;
        }

        isGrounded() {
            const pos = this.body.getPosition();
            const groundRayStart = Vec2(pos.x, pos.y);
            const groundRayEnd = Vec2(pos.x, pos.y - this.height / 2 - p2m(1));
            let isGrounded = false;
            world.rayCast(groundRayStart, groundRayEnd, (fixture) => {
                const userData = fixture.getBody().getUserData();
                if (userData && (userData.type === 'ground' || userData.type === 'block')) {
                    isGrounded = true;
                    return 0;
                }
                return -1;
            });
            return isGrounded;
        }

        tryJump() {
            if (this.isGrounded() && this.jumpCooldown === 0) {
                this.body.applyLinearImpulse(Vec2(0, JUMP_IMPULSE), this.body.getWorldCenter(), true);
                this.jumpCooldown = 0.2;
            }
        }

        update(dt) {
            this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
            
            if (this.playerNumber === 1) { // Player 1 Controls (Arrows)
                if (keys['ArrowLeft']) this.body.applyForceToCenter(Vec2(-MOVE_FORCE, 0), true);
                if (keys['ArrowRight']) this.body.applyForceToCenter(Vec2(MOVE_FORCE, 0), true);
                if (keys['ArrowUp']) this.tryJump();
            } else if (this.playerNumber === 2) { // Player 2 Controls (WASD)
                if (keys['KeyA']) this.body.applyForceToCenter(Vec2(-MOVE_FORCE, 0), true);
                if (keys['KeyD']) this.body.applyForceToCenter(Vec2(MOVE_FORCE, 0), true);
                if (keys['KeyW']) this.tryJump();
            }
             
            const vel = this.body.getLinearVelocity();
            if (Math.abs(vel.x) > MAX_VELOCITY) {
                vel.x = Math.sign(vel.x) * MAX_VELOCITY;
                this.body.setLinearVelocity(vel);
            }
        }

        render(ctx) {
            const pos = this.body.getPosition();
            const x = m2p(pos.x);
            const y = canvas.height - m2p(pos.y); 
            ctx.fillStyle = this.playerNumber === 1 ? 'red' : '#000080';
            ctx.fillRect(x - m2p(this.width/2), y - m2p(this.height/2), m2p(this.width), m2p(this.height));
        }

        die() {
            this.lives--;
            if (this.lives <= 0) console.log(`Player ${this.playerNumber} is out of lives!`);
            else {
                this.body.setPosition(Vec2(4, 5));
                this.body.setLinearVelocity(Vec2(0,0));
            }
        }

        addScore(points) { this.score += points; }
        addCoin() {
            this.coins++;
            this.addScore(200);
            if (this.coins >= 100) {
                this.coins = 0;
                this.lives++;
            }
        }
    }
    
    class Enemy {
        constructor(world, x, y) {
            this.width = p2m(32); this.height = p2m(32);
            this.body = world.createDynamicBody({ position: Vec2(x, y), fixedRotation: true });
            this.body.createFixture(pl.Box(this.width / 2, this.height / 2), { density: 0.5, friction: 0.1 });
            this.body.setUserData({ type: 'enemy', enemy: this });
            this.speed = 2; this.direction = -1; this.isStomped = false; this.stompTime = 0;
        }
        update(dt) {
            if (this.isStomped) { this.stompTime += dt; if(this.stompTime > 0.5) { world.destroyBody(this.body); enemies = enemies.filter(e => e !== this); } return; }
            this.body.setLinearVelocity(Vec2(this.speed * this.direction, this.body.getLinearVelocity().y));
            const currentPos = this.body.getPosition(); const probeX = currentPos.x + (this.direction * (this.width / 2 + p2m(1))); const probeY = currentPos.y - (this.height / 2 + p2m(1));
            let groundAhead = false;
            world.queryAABB(pl.AABB(Vec2(probeX, probeY), Vec2(probeX, probeY)), (fixture) => { const userData = fixture.getBody().getUserData(); if (userData && (userData.type === 'ground' || userData.type === 'block')) groundAhead = true; return true; });
            if (!groundAhead) this.direction *= -1;
        }
        stomp() { if(this.isStomped) return; this.isStomped = true; this.body.destroyFixture(this.body.getFixtureList()); this.body.createFixture(pl.Box(this.width / 2, this.height / 4, Vec2(0, -this.height / 4)), {}); this.body.setLinearVelocity(Vec2(0,0)); }
        render(ctx) { const pos = this.body.getPosition(); const x = m2p(pos.x); const y = canvas.height - m2p(pos.y); ctx.fillStyle = this.isStomped ? '#754719' : '#d2691e'; ctx.fillRect(x - m2p(this.width/2), y - m2p(this.height/2), m2p(this.width), this.isStomped ? m2p(this.height/2) : m2p(this.height)); }
    }

    class Block {
        constructor(world, x, y, type) { this.type = type; this.initialPos = Vec2(x, y); this.width = p2m(32); this.height = p2m(32); this.body = world.createBody({ position: this.initialPos }); this.body.createFixture(pl.Box(this.width / 2, this.height / 2)); this.body.setUserData({ type: 'block', block: this }); this.isHit = false; }
        hit(player) { if (this.type === 'question' && !this.isHit) { this.isHit = true; const coin = new PowerUp(world, this.initialPos.x, this.initialPos.y + p2m(32), 'coin'); powerups.push(coin); coin.body.applyLinearImpulse(Vec2(0, 8), coin.body.getWorldCenter()); player.addCoin(); } }
        render(ctx) { const pos = this.body.getPosition(); const x = m2p(pos.x); const y = canvas.height - m2p(pos.y); if (this.type === 'ground') ctx.fillStyle = '#228B22'; else if (this.type === 'brick') ctx.fillStyle = '#B22222'; else if (this.type === 'solid') ctx.fillStyle = '#0000FF'; else if (this.type === 'question') ctx.fillStyle = this.isHit ? '#D3D3D3' : '#FFFFFF'; ctx.fillRect(x - m2p(this.width/2), y - m2p(this.height/2), m2p(this.width), m2p(this.height)); }
    }
    
    class PowerUp {
        constructor(world, x, y, type){ this.type = type; this.width = p2m(24); this.height = p2m(24); this.body = world.createDynamicBody({ position: Vec2(x,y) }); this.body.createFixture(pl.Circle(this.width/2), {isSensor: true}); this.body.setUserData({type: 'powerup', powerup: this}); this.collected = false; }
        render(ctx) { const pos = this.body.getPosition(); const x = m2p(pos.x); const y = canvas.height - m2p(pos.y); ctx.fillStyle = 'yellow'; ctx.beginPath(); ctx.arc(x, y, m2p(this.width/2), 0, Math.PI * 2); ctx.fill(); }
        collect() { if (this.collected) return; this.collected = true; world.destroyBody(this.body); powerups = powerups.filter(p => p !== this); }
    }

    // --- LEVEL PARSING ---
    function parseLevel(levelData) {
        levelWidthInPixels = levelData[0].length * 32;
        const levelHeightInTiles = levelData.length;

        for (let r = 0; r < levelData.length; r++) { 
            for (let c = 0; c < levelData[r].length; c++) { 
                const char = levelData[r][c]; 
                const x = c * p2m(32) + p2m(16); 
                const y = (levelHeightInTiles - 1 - r) * p2m(32) + p2m(16);
                
                let block; 
                if (char === 'G') block = new Block(world, x, y, 'ground'); 
                else if (char === 'S') block = new Block(world, x, y, 'solid'); 
                else if (char === '#') block = new Block(world, x, y, 'brick'); 
                else if (char === '?') block = new Block(world, x, y, 'question'); 
                else if (char === 'E') enemies.push(new Enemy(world, x, y)); 

                if (block) { 
                    block.body.setStatic(); 
                    if (char === 'G' || char === '#' || char === 'S') {
                         block.body.setUserData({ type: 'ground', block: block });
                    } else {
                         block.body.setUserData({ type: 'block', block: block });
                    }
                    blocks.push(block); 
                } 
            } 
        }
    }
    
    // --- COLLISION HANDLING ---
    world.on('begin-contact', (contact) => handleContact(contact.getFixtureA(), contact.getFixtureB(), true));
    function handleContact(fixtureA, fixtureB, isBeginning) {
        const dataA = fixtureA.getUserData() || {}; const dataB = fixtureB.getUserData() || {}; const pairs = [ { a: dataA, b: dataB }, { a: dataB, b: dataA } ];
        for (const pair of pairs) {
            if (isBeginning && pair.a.type === 'player' && pair.b.type === 'enemy') { const player = pair.a.player, enemy = pair.b.enemy; if (player.body.getPosition().y > enemy.body.getPosition().y + p2m(12) && player.body.getLinearVelocity().y < 0) { enemy.stomp(); player.addScore(100); const vel = player.body.getLinearVelocity(); player.body.setLinearVelocity(Vec2(vel.x, 0)); player.body.applyLinearImpulse(Vec2(0, JUMP_IMPULSE / 1.5), player.body.getWorldCenter(), true); } else if (!enemy.isStomped) player.die(); }
            else if (isBeginning && pair.a.type === 'player' && pair.b.type === 'block') { if (pair.a.player.body.getPosition().y < pair.b.block.body.getPosition().y - p2m(16)) { pair.b.block.hit(pair.a.player); } }
            else if (isBeginning && pair.a.type === 'player' && pair.b.type === 'powerup') { pair.b.powerup.collect(); }
        }
    }

    // --- MAIN GAME LOOP ---
    function gameLoop(currentTime) { if (gameOver) return; requestAnimationFrame(gameLoop); const dt = (currentTime - lastTime) / 1000; lastTime = currentTime; gameTime = Math.max(0, gameTime - dt); players.forEach(p => p.update(dt)); enemies.forEach(e => e.update(dt)); camera.update(); world.step(TIME_STEP); render(); }

    // --- RENDER FUNCTION ---
    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.translate(-camera.x, 0); blocks.forEach(b => b.render(ctx)); enemies.forEach(e => e.render(ctx)); powerups.forEach(p => p.render(ctx)); players.forEach(p => p.render(ctx)); ctx.restore();
        if (players[0]) { document.getElementById('p1-score').textContent = formatNumber(players[0].score, 6); document.getElementById('p1-coins').textContent = formatNumber(players[0].coins, 2); document.getElementById('p1-lives').textContent = players[0].lives; }
        if (players[1]) { document.getElementById('p2-score').textContent = formatNumber(players[1].score, 6); document.getElementById('p2-coins').textContent = formatNumber(players[1].coins, 2); document.getElementById('p2-lives').textContent = players[1].lives; }
        document.getElementById('timer').textContent = Math.ceil(gameTime);
    }
    
    // --- GAME START & MENU LOGIC ---
    function startGame(mapType) {
        // 1. Remove the menu
        const menu = document.getElementById('start-menu');
        if (menu) menu.remove();

        // 2. Generate the level data based on choice
        let levelData;
        if (mapType === 'original') {
            levelData = originalLevelData;
        } else {
            // Generate a level 200 tiles wide, 30 tiles high, with 150 platforms
            levelData = RandomPlatformGenerator.generateLevelData(200, 30, 150);
        }

        // 3. Parse the data to create game objects
        parseLevel(levelData);
        
        // 4. Create players
        players.push(new Player(world, 4, 5, 1));
        players.push(new Player(world, 5, 5, 2));

        // 5. Start the game loop
        lastTime = performance.now(); 
        requestAnimationFrame(gameLoop); 
    }

    function showStartMenu() {
        const gameContainer = document.getElementById('game-container');
        
        const menu = document.createElement('div');
        menu.id = 'start-menu';

        const title = document.createElement('h1');
        title.textContent = 'Planck.js Platformer';
        
        const originalButton = document.createElement('button');
        originalButton.textContent = 'Original Map';
        originalButton.onclick = () => startGame('original');

        const proceduralButton = document.createElement('button');
        proceduralButton.textContent = 'Procedural Map';
        proceduralButton.onclick = () => startGame('procedural');

        menu.appendChild(title);
        menu.appendChild(originalButton);
        menu.appendChild(proceduralButton);

        gameContainer.appendChild(menu);
    }

    // --- INITIALIZATION ---
    function init() {
        showStartMenu();
    }

    init();

})();
