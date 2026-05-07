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
    let isProceduralMode = false;
    let maxGeneratedCol = 0;

    // Input State
    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);

    // ==========================================
    // --- GAMEPAD STATE & LOGIC ---
    // ==========================================
    let player1GamepadIndex = null;
    let player2GamepadIndex = null;
    const gamepadAssignmentCooldown = {};
    const FACE_BUTTON_INDICES = [0, 1, 2, 3]; // A, B, X, Y (standard layout)
    const DEADZONE = 0.2; // Deadzone for left analog stick

    function pollGamepads() {
        const pads = navigator.getGamepads();
        if (!pads) return;

        // Reset virtual gamepad keys each frame
        keys['gp_p1_left'] = false;
        keys['gp_p1_right'] = false;
        keys['gp_p1_jump'] = false;
        keys['gp_p2_left'] = false;
        keys['gp_p2_right'] = false;
        keys['gp_p2_jump'] = false;

        // --- Step 1: Assignment Logic ---
        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (!pad || gamepadAssignmentCooldown[i]) continue;

            const isAssigned = (player1GamepadIndex === i || player2GamepadIndex === i);
            if (isAssigned) continue;

            const faceButtonPressed = FACE_BUTTON_INDICES.some(index => pad.buttons[index]?.pressed);
            if (faceButtonPressed) {
                if (player1GamepadIndex === null) {
                    player1GamepadIndex = i;
                    console.log(`Gamepad ${i} (${pad.id}) assigned to Player 1.`);
                } else if (player2GamepadIndex === null) {
                    player2GamepadIndex = i;
                    console.log(`Gamepad ${i} (${pad.id}) assigned to Player 2.`);
                }
                // Cooldown to prevent double assignment on a single press
                gamepadAssignmentCooldown[i] = true;
                setTimeout(() => delete gamepadAssignmentCooldown[i], 1000);
            }
        }
        
        // --- Step 2: Player 1 Input ---
        if (player1GamepadIndex !== null) {
            const pad = pads[player1GamepadIndex];
            if (!pad) { player1GamepadIndex = null; } // Disconnected
            else {
                // Move Left: D-Pad Left (14) OR Left Stick X Axis < -0.2
                keys['gp_p1_left'] = pad.buttons[14]?.pressed || (pad.axes[0] < -DEADZONE);
                // Move Right: D-Pad Right (15) OR Left Stick X Axis > 0.2
                keys['gp_p1_right'] = pad.buttons[15]?.pressed || (pad.axes[0] > DEADZONE);
                // Jump: Any Face Button (A, B, X, Y)
                keys['gp_p1_jump'] = FACE_BUTTON_INDICES.some(index => pad.buttons[index]?.pressed);
            }
        }

        // --- Step 3: Player 2 Input ---
        if (player2GamepadIndex !== null) {
            const pad = pads[player2GamepadIndex];
            if (!pad) { player2GamepadIndex = null; } // Disconnected
            else {
                keys['gp_p2_left'] = pad.buttons[14]?.pressed || (pad.axes[0] < -DEADZONE);
                keys['gp_p2_right'] = pad.buttons[15]?.pressed || (pad.axes[0] > DEADZONE);
                keys['gp_p2_jump'] = FACE_BUTTON_INDICES.some(index => pad.buttons[index]?.pressed);
            }
        }
    }

    // --- GAMEPAD CONNECTION LISTENERS ---
    window.addEventListener("gamepadconnected", (e) => {
        console.log(`Gamepad connected at index ${e.gamepad.index}: ${e.gamepad.id}. Press a face button to assign.`);
    });
    window.addEventListener("gamepaddisconnected", (e) => {
        console.log(`Gamepad disconnected from index ${e.gamepad.index}: ${e.gamepad.id}.`);
        if (player1GamepadIndex === e.gamepad.index) {
            console.log("Player 1 gamepad disconnected.");
            player1GamepadIndex = null;
        }
        if (player2GamepadIndex === e.gamepad.index) {
            console.log("Player 2 gamepad disconnected.");
            player2GamepadIndex = null;
        }
    });
    // ==========================================

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
            
            // Keep player 1/3rd from the left side of the screen
            let targetX = m2p(avgX) - this.width / 3; 
            this.x += (targetX - this.x) * 0.1;
            
            if (this.x < 0) this.x = 0;
            
            // If playing the original finite map, clamp the camera to the end
            if (!isProceduralMode && levelWidthInPixels > this.width && this.x > levelWidthInPixels - this.width) {
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

    // --- INFINITE PROCEDURAL GENERATOR & GC ---
    const ChunkGenerator = {
        lastPlatY: p2m(96), // Tracks the height of the last generated platform
        
        generateProceduralChunk() {
            const startCol = maxGeneratedCol;
            const endCol = startCol + 40; // Generate 40 tiles wide at a time
            
            // PASS 1: GROUND & PITS
            let c = startCol;
            while (c < endCol) {
                let isPit = (c > 15) && (Math.random() < 0.12); 
                let pitWidth = isPit ? Math.floor(Math.random() * 3) + 2 : 0;

                if (isPit) {
                    c += pitWidth;
                } else {
                    let x = c * p2m(32) + p2m(16);
                    let bG = new Block(world, x, p2m(48), 'ground'); 
                    bG.body.setStatic(); bG.body.setUserData({type: 'ground', block: bG}); blocks.push(bG);
                    
                    let bS = new Block(world, x, p2m(16), 'solid'); 
                    bS.body.setStatic(); bS.body.setUserData({type: 'ground', block: bS}); blocks.push(bS);
                    
                    if (Math.random() < 0.05) enemies.push(new Enemy(world, x, p2m(80)));
                    c++;
                }
            }

            // PASS 2: PLATFORMS AT VARIOUS HEIGHTS
            let pCol = startCol + Math.floor(Math.random() * 5) + 3; 
            
            while (pCol < endCol) {
                let yShift = (Math.floor(Math.random() * 7) - 3) * p2m(32); 
                let newY = this.lastPlatY + yShift;
                newY = Math.max(p2m(112), Math.min(newY, p2m(350)));
                this.lastPlatY = newY;

                const platWidth = Math.floor(Math.random() * 4) + 3;
                let hasEnemy = Math.random() < 0.4;

                for (let j = 0; j < platWidth; j++) {
                    let platX = (pCol + j) * p2m(32) + p2m(16);
                    let platType = (Math.random() < 0.25) ? 'question' : 'brick';
                    
                    let bP = new Block(world, platX, newY, platType);
                    bP.body.setStatic(); bP.body.setUserData({type: 'block', block: bP}); blocks.push(bP);

                    if (hasEnemy && j === Math.floor(platWidth / 2)) {
                        enemies.push(new Enemy(world, platX, newY + p2m(32)));
                        hasEnemy = false;
                    }
                }

                if (Math.random() < 0.45) {
                    let secondaryY = newY + (Math.random() > 0.5 ? p2m(96) : -p2m(96));
                    if (secondaryY >= p2m(112) && secondaryY <= p2m(350)) {
                        let secWidth = Math.max(1, platWidth - 2);
                        let offset = Math.floor(Math.random() * 2);
                        for (let j = 0; j < secWidth; j++) {
                            let secX = (pCol + offset + j) * p2m(32) + p2m(16);
                            let secType = (Math.random() < 0.3) ? 'question' : 'brick';
                            let bP = new Block(world, secX, secondaryY, secType);
                            bP.body.setStatic(); bP.body.setUserData({type: 'block', block: bP}); blocks.push(bP);
                        }
                    }
                }
                let gap = Math.floor(Math.random() * 4) + 2;
                pCol += platWidth + gap;
            }
            maxGeneratedCol = endCol;
            gameTime += 20;
        }
    };

    function cleanupWorld() {
        const leftBound = p2m(camera.x - 600); 
        blocks = blocks.filter(b => {
            if (b.body.getPosition().x < leftBound) { world.destroyBody(b.body); return false; }
            return true;
        });
        enemies = enemies.filter(e => {
            if (e.body.getPosition().x < leftBound) { world.destroyBody(e.body); return false; }
            return true;
        });
        powerups = powerups.filter(p => {
            if (p.body.getPosition().x < leftBound) { world.destroyBody(p.body); return false; }
            return true;
        });
    }

    // --- CLASSES ---
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
            
            if (this.playerNumber === 1) { // Player 1 Controls (Keyboard + Gamepad)
                if (keys['ArrowLeft'] || keys['gp_p1_left']) this.body.applyForceToCenter(Vec2(-MOVE_FORCE, 0), true);
                if (keys['ArrowRight'] || keys['gp_p1_right']) this.body.applyForceToCenter(Vec2(MOVE_FORCE, 0), true);
                if (keys['ArrowUp'] || keys['gp_p1_jump']) this.tryJump();
            } else if (this.playerNumber === 2) { // Player 2 Controls (Keyboard + Gamepad)
                if (keys['KeyA'] || keys['gp_p2_left']) this.body.applyForceToCenter(Vec2(-MOVE_FORCE, 0), true);
                if (keys['KeyD'] || keys['gp_p2_right']) this.body.applyForceToCenter(Vec2(MOVE_FORCE, 0), true);
                if (keys['KeyW'] || keys['gp_p2_jump']) this.tryJump();
            }
             
            const vel = this.body.getLinearVelocity();
            if (Math.abs(vel.x) > MAX_VELOCITY) {
                vel.x = Math.sign(vel.x) * MAX_VELOCITY;
                this.body.setLinearVelocity(vel);
            }
            
            if (this.body.getPosition().y < -1) {
                this.die();
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
            if (this.lives <= 0) {
                console.log(`Player ${this.playerNumber} is out of lives!`);
                this.body.setPosition(Vec2(-100, 5));
            } else {
                const respawnX = p2m(camera.x + camera.width / 2);
                this.body.setPosition(Vec2(respawnX, 12)); 
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
            
            if (this.body.getPosition().y < -1) {
                world.destroyBody(this.body); enemies = enemies.filter(e => e !== this);
            }
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

    // --- LEVEL PARSING (For original map) ---
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
    function gameLoop(currentTime) { 
        if (gameOver) return; 
        requestAnimationFrame(gameLoop); 
        
        // Process gamepad states prior to physics update
        pollGamepads();

        const dt = (currentTime - lastTime) / 1000; 
        lastTime = currentTime; 
        gameTime = Math.max(0, gameTime - dt); 
        
        players.forEach(p => p.update(dt)); 
        enemies.forEach(e => e.update(dt)); 
        camera.update(); 
        
        if (isProceduralMode) {
            if (camera.x + camera.width + 600 > maxGeneratedCol * 32) {
                ChunkGenerator.generateProceduralChunk();
                cleanupWorld();
            }
        }
        
        world.step(TIME_STEP); 
        render(); 
    }

    // --- RENDER FUNCTION ---
    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        ctx.save(); 
        ctx.translate(-camera.x, 0); 
        
        blocks.forEach(b => b.render(ctx)); 
        enemies.forEach(e => e.render(ctx)); 
        powerups.forEach(p => p.render(ctx)); 
        players.forEach(p => p.render(ctx)); 
        
        ctx.restore();
        
        if (players[0]) { document.getElementById('p1-score').textContent = formatNumber(players[0].score, 6); document.getElementById('p1-coins').textContent = formatNumber(players[0].coins, 2); document.getElementById('p1-lives').textContent = players[0].lives; }
        if (players[1]) { document.getElementById('p2-score').textContent = formatNumber(players[1].score, 6); document.getElementById('p2-coins').textContent = formatNumber(players[1].coins, 2); document.getElementById('p2-lives').textContent = players[1].lives; }
        document.getElementById('timer').textContent = Math.ceil(gameTime);
    }
    
    // --- GAME START & MENU LOGIC ---
    function startGame(mapType) {
        const menu = document.getElementById('start-menu');
        if (menu) menu.remove();

        if (mapType === 'original') {
            isProceduralMode = false;
            parseLevel(originalLevelData);
        } else {
            isProceduralMode = true;
            maxGeneratedCol = 0;
            gameTime = 100;
            ChunkGenerator.lastPlatY = p2m(96);
            ChunkGenerator.generateProceduralChunk();
            ChunkGenerator.generateProceduralChunk();
        }

        players.push(new Player(world, 4, 10, 1));
        players.push(new Player(world, 5, 10, 2));

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

    // --- MOBILE CONTROLS & FULLSCREEN ---
    const mobileToggleBtn = document.getElementById('mobile-btn');
    const mobileControls = document.getElementById('mobile-controls');
    const mobileLeftBtn = document.getElementById('mobile-left');
    const mobileRightBtn = document.getElementById('mobile-right');
    const mobileUpBtn = document.getElementById('mobile-up');
    const screenElement = document.getElementById("screen");

    function scaleGame() {
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        if (isFullscreen) {
            const baseWidth = 800;
            const baseHeight = 450;
            
            const scale = Math.min(
                window.innerWidth / baseWidth,
                window.innerHeight / baseHeight
            );
            
            screenElement.style.transform = `scale(${scale})`;
            document.body.classList.add('mobile-mode');
        } else {
            screenElement.style.transform = 'none'; 
            document.body.classList.remove('mobile-mode');
        }
    }

    function goFull() {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }

    window.addEventListener("resize", scaleGame);
    window.addEventListener("fullscreenchange", scaleGame);
    window.addEventListener("webkitfullscreenchange", scaleGame);
    scaleGame();
    if(mobileToggleBtn) {
        mobileToggleBtn.addEventListener('click', goFull);
    }

    function setupMobileControls() {
        if (!mobileControls) return;
        
        const addControlListener = (element, key) => {
            if(!element) return;
            const pressKey = (e) => {
                if(e.cancelable) e.preventDefault(); 
                keys[key] = true;
            };
            const releaseKey = (e) => {
                if(e.cancelable) e.preventDefault();
                keys[key] = false;
            };

            element.addEventListener('touchstart', pressKey, { passive: false });
            element.addEventListener('touchend', releaseKey, { passive: false });
            element.addEventListener('touchcancel', releaseKey, { passive: false });
            
            element.addEventListener('mousedown', pressKey);
            element.addEventListener('mouseup', releaseKey);
            element.addEventListener('mouseleave', (e) => {
                if (e.buttons === 1) { releaseKey(e); }
            });
        };

        addControlListener(mobileLeftBtn, 'ArrowLeft');
        addControlListener(mobileRightBtn, 'ArrowRight');
        addControlListener(mobileUpBtn, 'ArrowUp'); 
    }
    setupMobileControls();

    // --- INITIALIZATION ---
    function init() {
        showStartMenu();
    }

    init();

})();
