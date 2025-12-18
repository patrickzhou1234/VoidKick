const canvas = document.getElementById("babcanv");
const menuselections = document.getElementById("menuselections");
const frontfacingvis = document.getElementById("frontfacingvis");
let checked = true;
const meshtype = document.getElementById("meshtype");
const slimyToggle = document.getElementById("slimyToggle");
const menureveal = document.getElementById("menureveal");
const size = document.getElementById("sizeToggle");
const clearBtn = document.getElementById("clearBtn");
const loadingScreen = document.getElementById("loadingScreen");
const engine = new BABYLON.Engine(canvas, true);

// Track if player is in contact with another object
let playerInContact = false;

const socket = io();
const otherPlayers = {};
const spawnedBlocks = [];

// Register as a player when connected
socket.on('connect', () => {
    socket.emit('registerPlayer');
});

// Third person toggle state
let isThirdPerson = false;

// Active key state tracking
const keysPressed = {};

// Create a simple sphere mesh for players
function createPlayerSphere(scene, name, color) {
    const sphere = BABYLON.MeshBuilder.CreateSphere(name, {diameter: 1.5, segments: 16}, scene);
    const mat = new BABYLON.StandardMaterial(name + "Mat", scene);
    mat.diffuseColor = color;
    mat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    sphere.material = mat;
    return sphere;
}

var createSceneWithoutPlayer = function () {
    var scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    scene.enablePhysics(new BABYLON.Vector3(0,-9.81, 0), new BABYLON.AmmoJSPlugin);
    scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.15, 1);
    
    // Camera setup
    camera = new BABYLON.FreeCamera("Camera", new BABYLON.Vector3(0, 1, 0), scene);
    camera.attachControl(canvas, true);
    camera.keysUp.pop(38);
    camera.keysDown.pop(40);
    camera.keysLeft.pop(37);
    camera.keysRight.pop(39);
    camera.angularSensibility = 10000;

    // Lights
    var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;
    
    var dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
    dirLight.intensity = 0.5;

    var wallmat = new BABYLON.StandardMaterial("wallmat", scene);
    wallmat.diffuseTexture = new BABYLON.Texture("wood.jpg", scene);
    wallmat.backFaceCulling = false;

    var groundmat = new BABYLON.StandardMaterial("groundmat", scene);
    groundmat.diffuseTexture = new BABYLON.Texture("https://i.imgur.com/fr2946D.png", scene);
    var ground = BABYLON.MeshBuilder.CreateGround("ground", {width: 30, height: 30}, scene);
    ground.material = groundmat;
    ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.MeshImpostor, {mass:0, restitution:0.3}, scene);
    
    var wallz = [15, 0, 0, -15];
    var wallrot = [0, 1, 1, 0];
    var wallx = [null, -15, 15, null];
    for (let i=0; i<4; i++) {
        var wall = BABYLON.MeshBuilder.CreateBox("wall", {width:30, height:2, depth:0.5}, scene);
        wall.physicsImpostor = new BABYLON.PhysicsImpostor(wall, BABYLON.PhysicsImpostor.BoxImpostor, {mass:0, restitution: 0.9}, scene);
        wall.position.y = 1;
        wall.position.z = wallz[i];
        wall.material = wallmat;
        if (wallrot[i] == 1) {
            wall.rotate(new BABYLON.Vector3(0, 1, 0), Math.PI/2, BABYLON.Space.LOCAL);
        }
        if (!(wallx[i] == null)) {
            wall.position.x = wallx[i];
        }
    }

    // Skybox gradient
    var bluemat = new BABYLON.StandardMaterial("bluemat", scene);
    bluemat.diffuseColor = new BABYLON.Color3.FromHexString("#87CEEB");
    bluemat.backFaceCulling = false;
    bluemat.emissiveColor = new BABYLON.Color3(0.3, 0.4, 0.5);
    var skybox = BABYLON.MeshBuilder.CreateSphere("skybox", {segments:32, diameter:100}, scene);
    skybox.material = bluemat;

    frontfacing = BABYLON.Mesh.CreateBox("front", 1, scene);
    frontfacing.visibility = 0.5;
    var frontMat = new BABYLON.StandardMaterial("frontMat", scene);
    frontMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    frontMat.alpha = 0.3;
    frontfacing.material = frontMat;

    // Jump reload
    jumpreloading = false;

    return scene;
};

function createPlayer(scene) {
    // Player sphere (visible, with physics)
    player = BABYLON.MeshBuilder.CreateSphere("player", {diameter: 1.5, segments: 16}, scene);
    player.position.y = 3;
    const playerMat = new BABYLON.StandardMaterial("playerMat", scene);
    playerMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1);
    playerMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    player.material = playerMat;
    player.physicsImpostor = new BABYLON.PhysicsImpostor(player, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 1, restitution: 0.3, friction: 0.5}, scene);
    
    // Use player directly as the physics body
    playerPhysicsBody = player;
    
    // Register collision callback to track contact state
    player.physicsImpostor.registerOnPhysicsCollide([], function(main, collided) {
        playerInContact = true;
    });
    
    // Set up collision detection with all physics objects
    scene.registerBeforeRender(function() {
        // Reset contact flag each frame - will be set by collision callback if touching
        playerInContact = false;
        
        // Check for collisions using ray casts in multiple directions
        const rayLength = 0.85; // Slightly more than sphere radius (0.75)
        const directions = [
            new BABYLON.Vector3(0, -1, 0),  // Down
            new BABYLON.Vector3(0, 1, 0),   // Up
            new BABYLON.Vector3(1, 0, 0),   // Right
            new BABYLON.Vector3(-1, 0, 0),  // Left
            new BABYLON.Vector3(0, 0, 1),   // Forward
            new BABYLON.Vector3(0, 0, -1)   // Back
        ];
        
        for (const dir of directions) {
            const ray = new BABYLON.Ray(player.position, dir, rayLength);
            const hit = scene.pickWithRay(ray, function(mesh) {
                return mesh !== player && mesh.name !== "skybox" && mesh.name !== "front";
            });
            if (hit && hit.hit) {
                playerInContact = true;
                break;
            }
        }
        
        if (!isThirdPerson) {
            camera.position.set(player.position.x, player.position.y + 0.5, player.position.z);
        } else {
            var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
            camera.position = player.position.subtract(forward.scale(8)).add(new BABYLON.Vector3(0, 3, 0));
        }

        // Update frontfacing position
        var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        frontfacing.position = player.position.add(forward.scale(5));
        
        // Continuous movement based on active keys
        handleMovement();
        
        // Emit player movement
        if (player && player.physicsImpostor) {
            const pos = player.getAbsolutePosition();
            socket.emit('playerMovement', {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                rotation: camera.rotation.y
            });
        }
    });
}

function handleMovement() {
    if (!player || !player.physicsImpostor) return;
    
    var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
    var right = camera.getDirection(new BABYLON.Vector3(1, 0, 0));
    forward.y = 0;
    forward.normalize();
    right.y = 0;
    right.normalize();
    
    const impulseStrength = 0.08;
    
    if (keysPressed['KeyW'] || keysPressed['ArrowUp']) {
        player.physicsImpostor.applyImpulse(forward.scale(impulseStrength), player.getAbsolutePosition());
    }
    if (keysPressed['KeyS'] || keysPressed['ArrowDown']) {
        player.physicsImpostor.applyImpulse(forward.scale(-impulseStrength), player.getAbsolutePosition());
    }
    if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) {
        player.physicsImpostor.applyImpulse(right.scale(-impulseStrength), player.getAbsolutePosition());
    }
    if (keysPressed['KeyD'] || keysPressed['ArrowRight']) {
        player.physicsImpostor.applyImpulse(right.scale(impulseStrength), player.getAbsolutePosition());
    }
    
    // Brake/crouch - only works when in contact with another object
    if ((keysPressed['ShiftLeft'] || keysPressed['ShiftRight']) && playerInContact) {
        player.physicsImpostor.setLinearVelocity(player.physicsImpostor.getLinearVelocity().scale(0.9));
        player.physicsImpostor.setAngularVelocity(player.physicsImpostor.getAngularVelocity().scale(0.9));
    }
}

let scene;

// Initialize the game
function initGame() {
    // Create the scene first (without the player)
    scene = createSceneWithoutPlayer();
    
    // Now create the player
    createPlayer(scene);
    
    // Hide loading screen
    loadingScreen.classList.add('hidden');
    
    // Start render loop
    engine.runRenderLoop(function () {
        scene.render();
    });
}

// Start the game
initGame();

// Multiplayer Logic
function addOtherPlayer(playerInfo) {
    // Create visible sphere for other players
    const mesh = createPlayerSphere(scene, "otherPlayer_" + playerInfo.playerId, new BABYLON.Color3(1, 0.3, 0.3));
    mesh.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
    mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 0, restitution: 0.3}, scene);
    
    otherPlayers[playerInfo.playerId] = { mesh };
}

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id === socket.id) return;
        addOtherPlayer(players[id]);
    });
});

socket.on('currentBlocks', (blocks) => {
    blocks.forEach((block) => {
        spawnBlock(block);
    });
});

socket.on('newPlayer', (playerInfo) => {
    addOtherPlayer(playerInfo);
});

socket.on('playerMoved', (playerInfo) => {
    if (otherPlayers[playerInfo.playerId]) {
        otherPlayers[playerInfo.playerId].mesh.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
        if (otherPlayers[playerInfo.playerId].mesh.physicsImpostor) {
            otherPlayers[playerInfo.playerId].mesh.physicsImpostor.setTransformationFromPhysicsBody();
        }
    }
});

socket.on('disconnectPlayer', (playerId) => {
    if (otherPlayers[playerId]) {
        otherPlayers[playerId].mesh.dispose();
        delete otherPlayers[playerId];
    }
});

socket.on('blockSpawned', (blockData) => {
    spawnBlock(blockData);
});

socket.on('clearBlocks', () => {
    spawnedBlocks.forEach(mesh => {
        mesh.dispose();
    });
    spawnedBlocks.length = 0;
});

// Helper function to spawn block
function spawnBlock(data) {
    var meshmat = new BABYLON.StandardMaterial("meshmat", scene);
    meshmat.diffuseColor = new BABYLON.Color3.FromHexString(data.color);
    meshmat.backFaceCulling = false;

    var mesh;
    var frictionVal = data.slimy ? 300 : 0.5;
    
    if (data.type == "box") {
        mesh = BABYLON.MeshBuilder.CreateBox("mesh", {size:data.size}, scene);
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.BoxImpostor, {mass:1, restitution:0, friction: frictionVal}, scene);
    }
    else if (data.type == "sphere") {
        mesh = BABYLON.MeshBuilder.CreateSphere("mesh", {diameter:data.size, segments:32}, scene);
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.SphereImpostor, {mass:1, restitution:0, friction: frictionVal}, scene);
    }
    else if (data.type == "cylinder") {
        mesh = BABYLON.MeshBuilder.CreateCylinder("mesh", {height:data.size, diameter:data.size}, scene);
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.CylinderImpostor, {mass:1, restitution:0, friction: frictionVal}, scene);
    }
    else if (data.type == "capsule") {
        mesh = BABYLON.MeshBuilder.CreateCapsule("mesh", {height:data.size, radius:(data.size/3)}, scene);
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.CapsuleImpostor, {mass:1, restitution:0, friction: frictionVal}, scene);
    }
    
    mesh.material = meshmat;
    if (data.type == "box" || data.type == "cylinder") {
        mesh.enableEdgesRendering();
        mesh.edgesWidth = 4.0;
        mesh.edgesColor = new BABYLON.Color4(1, 1, 1, 1);
    }
    mesh.position.set(data.position.x, data.position.y, data.position.z);
    
    spawnedBlocks.push(mesh);
}

frontfacingvis.onchange = function() {
    if (checked) {
        frontfacing.visibility = 0;
        checked = false;
    } else {
        frontfacing.visibility = 0.5;
        checked = true;
    }
}

canvas.onclick = function() {
    canvas.requestPointerLock = 
        canvas.requestPointerLock ||
        canvas.mozRequestPointerLock ||
        canvas.webkitRequestPointerLock;
    canvas.requestPointerLock();

    const sizeval = size.value/50;
    
    const spawnPos = frontfacing.getAbsolutePosition();
    const blockData = {
        type: meshtype.value,
        size: sizeval,
        position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
        color: document.getElementById("colorpicker").value,
        slimy: slimyToggle.checked
    };

    spawnBlock(blockData);
    socket.emit('spawnBlock', blockData);
}

clearBtn.onclick = function() {
    socket.emit('clearBlocks');
}

// Key state tracking
document.addEventListener('keydown', function(event) {
    keysPressed[event.code] = true;
    
    // Toggle Camera 'C'
    if (event.code === "KeyC") {
        isThirdPerson = !isThirdPerson;
    }

    // Jump
    if (event.code === "Space") {
        if (!jumpreloading) {
            jumpreloading = true;
            player.physicsImpostor.applyImpulse(new BABYLON.Vector3(0, 1, 0).scale(10), player.getAbsolutePosition());
            setTimeout(function() {
                jumpreloading = false;
            }, 3000);
        }
    }
});

document.addEventListener('keyup', function(event) {
    keysPressed[event.code] = false;
});

menureveal.onclick = function() {
    if (menureveal.innerHTML == "⇧") {
        menureveal.innerHTML = "⇩";
        menureveal.style.top = "0px";
        menuselections.style.top = "-80px";
    } else {
        menureveal.innerHTML = "⇧";
        menureveal.style.top = "70px";
        menuselections.style.top = "0px";
    }
}

window.addEventListener("resize", function () {
    engine.resize();
});
