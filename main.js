import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { DeviceOrientationControls } from 'three/addons/controls/DeviceOrientationControls.js';

// ---------- MAZE DEFINITION (same) ----------
const mazeGrid = [
    [0, 0, 1, 0, 0],
    [1, 0, 1, 0, 1],
    [0, 0, 0, 0, 0],
    [0, 1, 1, 0, 1],
    [0, 0, 0, 0, 0]
];
const CELL_SIZE = 1.6;
const WALL_HEIGHT = 2.2;
const rows = mazeGrid.length;
const cols = mazeGrid[0].length;
const offsetX = - (cols - 1) * CELL_SIZE / 2;
const offsetZ = - (rows - 1) * CELL_SIZE / 2;

// ---------- Three.js ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1030);
scene.fog = new THREE.FogExp2(0x0a1030, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6;
camera.position.set(offsetX, 1.6, offsetZ); // start at (0,0) cell

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);
const fillLight = new THREE.PointLight(0x554422, 0.5);
fillLight.position.set(0, 3, 0);
scene.add(fillLight);

// Maze group
const mazeGroup = new THREE.Group();
scene.add(mazeGroup);

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2a1f, roughness: 0.8 });
const wallColliders = [];

function buildMaze() {
    while(mazeGroup.children.length) mazeGroup.remove(mazeGroup.children[0]);
    wallColliders.length = 0;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = offsetX + col * CELL_SIZE;
            const z = offsetZ + row * CELL_SIZE;
            const floor = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, 0.1, CELL_SIZE), floorMaterial);
            floor.position.set(x, -0.05, z);
            floor.receiveShadow = true;
            mazeGroup.add(floor);
            if (mazeGrid[row][col] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMaterial);
                wall.position.set(x, WALL_HEIGHT/2, z);
                wall.castShadow = true;
                wall.receiveShadow = true;
                mazeGroup.add(wall);
                const box = new THREE.Box3().setFromObject(wall);
                wallColliders.push(box);
            }
        }
    }
}
buildMaze();

// Hint sphere
const hintRow = 2, hintCol = 2;
const hintPosLocal = new THREE.Vector3(offsetX + hintCol * CELL_SIZE, 0.8, offsetZ + hintRow * CELL_SIZE);
const hintMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0x442200, emissiveIntensity: 0.8 });
const hintSphere = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), hintMat);
hintSphere.position.copy(hintPosLocal);
mazeGroup.add(hintSphere);

// Exit
const exitRow = 4, exitCol = 4;
const exitPosLocal = new THREE.Vector3(offsetX + exitCol * CELL_SIZE, 0.7, offsetZ + exitRow * CELL_SIZE);
const exitObj = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xffaa33, metalness: 0.9, roughness: 0.2, emissive: 0x442200 })
);
exitObj.position.copy(exitPosLocal);
mazeGroup.add(exitObj);

// Game state
let hintShown = false;
let gameWon = false;
const hintDiv = document.getElementById('hint-message');
const winDiv = document.getElementById('win-message');
const errorDiv = document.getElementById('error-message');

function showHint() {
    if (hintShown) return;
    hintShown = true;
    hintDiv.classList.remove('hidden');
    setTimeout(() => hintDiv.classList.add('hidden'), 4000);
    hintMat.emissiveIntensity = 0.2;
}

function winGame() {
    if (gameWon) return;
    gameWon = true;
    winDiv.classList.remove('hidden');
    // Disable all controls
    if (currentControls) currentControls.disconnect?.();
}

// Collision detection (player bounding box)
const playerRadius = 0.4;
function collidesWithWalls(pos) {
    const playerBox = new THREE.Box3().set(
        new THREE.Vector3(pos.x - playerRadius, pos.y - 0.8, pos.z - playerRadius),
        new THREE.Vector3(pos.x + playerRadius, pos.y + 0.8, pos.z + playerRadius)
    );
    for (let wall of wallColliders) {
        if (playerBox.intersectsBox(wall)) return true;
    }
    return false;
}

function tryMove(deltaMove) {
    let newPos = camera.position.clone().add(deltaMove);
    if (!collidesWithWalls(newPos)) {
        camera.position.copy(newPos);
    } else {
        // slide along X and Z separately
        const moveX = new THREE.Vector3(deltaMove.x, 0, 0);
        const newX = camera.position.clone().add(moveX);
        if (!collidesWithWalls(newX)) camera.position.x = newX.x;
        const moveZ = new THREE.Vector3(0, 0, deltaMove.z);
        const newZ = camera.position.clone().add(moveZ);
        if (!collidesWithWalls(newZ)) camera.position.z = newZ.z;
    }
    // Clamp to maze bounds
    const minX = offsetX - playerRadius;
    const maxX = offsetX + (cols-1)*CELL_SIZE + playerRadius;
    const minZ = offsetZ - playerRadius;
    const maxZ = offsetZ + (rows-1)*CELL_SIZE + playerRadius;
    camera.position.x = Math.min(maxX, Math.max(minX, camera.position.x));
    camera.position.z = Math.min(maxZ, Math.max(minZ, camera.position.z));
    
    // Check hint/exit based on current cell
    const cell = getCellFromWorldPos(camera.position);
    if (cell) {
        if (!hintShown && cell.row === hintRow && cell.col === hintCol) showHint();
        if (!gameWon && cell.row === exitRow && cell.col === exitCol) winGame();
    }
}

function getCellFromWorldPos(worldPos) {
    for (let r=0; r<rows; r++) {
        for (let c=0; c<cols; c++) {
            const cx = offsetX + c*CELL_SIZE;
            const cz = offsetZ + r*CELL_SIZE;
            if (Math.abs(worldPos.x - cx) < CELL_SIZE/2 && Math.abs(worldPos.z - cz) < CELL_SIZE/2)
                return { row: r, col: c };
        }
    }
    return null;
}

// ---------- CONTROL MODES ----------
let currentControls = null;

// 1) DESKTOP (PointerLock + WASD)
function initDesktop() {
    cleanupControls();
    const controls = new PointerLockControls(camera, document.body);
    currentControls = controls;
    
    // Show lock button (create if not exists)
    let lockBtn = document.getElementById('controls-lock');
    if (!lockBtn) {
        lockBtn = document.createElement('div');
        lockBtn.id = 'controls-lock';
        lockBtn.textContent = '🔒 Click to lock mouse';
        lockBtn.style.cssText = 'position:absolute; bottom:20px; left:20px; background:#222; color:#eee; padding:8px 16px; border-radius:20px; cursor:pointer; z-index:20;';
        document.body.appendChild(lockBtn);
        lockBtn.addEventListener('click', () => controls.lock());
    }
    lockBtn.style.display = 'block';
    
    const keyState = { w:false, s:false, a:false, d:false, ArrowUp:false, ArrowDown:false, ArrowLeft:false, ArrowRight:false };
    const handleKey = (e, value) => {
        const k = e.key;
        if (keyState.hasOwnProperty(k)) keyState[k] = value;
    };
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
    
    let lastTime = performance.now();
    function animateMovement() {
        if (!controls.isLocked || gameWon) return;
        const now = performance.now();
        let delta = Math.min(0.033, (now - lastTime)/1000);
        lastTime = now;
        const speed = 4.5;
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0; forward.normalize();
        right.crossVectors(new THREE.Vector3(0,1,0), forward);
        let move = new THREE.Vector3(0,0,0);
        if (keyState.w || keyState.ArrowUp) move.add(forward);
        if (keyState.s || keyState.ArrowDown) move.sub(forward);
        if (keyState.d || keyState.ArrowRight) move.add(right);
        if (keyState.a || keyState.ArrowLeft) move.sub(right);
        move.normalize().multiplyScalar(speed * delta);
        tryMove(move);
    }
    const interval = setInterval(animateMovement, 16);
    controls.disconnect = () => {
        clearInterval(interval);
        controls.unlock();
        window.removeEventListener('keydown', handleKey);
        window.removeEventListener('keyup', handleKey);
        if (lockBtn) lockBtn.style.display = 'none';
    };
}

// 2) MOBILE VR (DeviceOrientation + on‑screen buttons)
let orientationControls = null;
let moveInterval = null;
function initMobileVR() {
    cleanupControls();
    // Enable device orientation
    orientationControls = new DeviceOrientationControls(camera);
    orientationControls.connect();
    orientationControls.update();
    currentControls = orientationControls;
    
    // Show touch buttons
    const mobileDiv = document.getElementById('mobile-controls');
    mobileDiv.classList.remove('hidden');
    
    let moveVec = { x:0, z:0 };
    const speed = 3.5;
    const updateMovement = () => {
        if (gameWon) return;
        const move = new THREE.Vector3(moveVec.x, 0, moveVec.z);
        // rotate move vector by camera's yaw (orientation)
        const yaw = camera.rotation.y;
        const rotated = new THREE.Vector3(
            move.x * Math.cos(yaw) - move.z * Math.sin(yaw),
            0,
            move.x * Math.sin(yaw) + move.z * Math.cos(yaw)
        );
        rotated.multiplyScalar(speed * 0.016); // assume ~60fps
        tryMove(rotated);
    };
    if (moveInterval) clearInterval(moveInterval);
    moveInterval = setInterval(updateMovement, 16);
    
    // Button handlers
    const fwd = document.getElementById('move-fwd');
    const back = document.getElementById('move-back');
    const left = document.getElementById('move-left');
    const right = document.getElementById('move-right');
    const setMove = (dir, active) => {
        if (dir === 'fwd') moveVec.z = active ? -1 : 0;
        if (dir === 'back') moveVec.z = active ? 1 : 0;
        if (dir === 'left') moveVec.x = active ? -1 : 0;
        if (dir === 'right') moveVec.x = active ? 1 : 0;
        // renormalize if both opposite pressed
        if (moveVec.z !== 0 && ((fwd.active && back.active) || (moveVec.z === -1 && moveVec.z === 1))) moveVec.z = 0;
        if (moveVec.x !== 0 && ((left.active && right.active) || (moveVec.x === -1 && moveVec.x === 1))) moveVec.x = 0;
    };
    const onPointer = (btn, dir, e) => {
        e.preventDefault();
        setMove(dir, true);
        btn.addEventListener('pointerup', () => setMove(dir, false), { once: true });
        btn.addEventListener('pointercancel', () => setMove(dir, false), { once: true });
    };
    fwd.addEventListener('pointerdown', (e) => onPointer(fwd, 'fwd', e));
    back.addEventListener('pointerdown', (e) => onPointer(back, 'back', e));
    left.addEventListener('pointerdown', (e) => onPointer(left, 'left', e));
    right.addEventListener('pointerdown', (e) => onPointer(right, 'right', e));
    
    orientationControls.disconnect = () => {
        clearInterval(moveInterval);
        orientationControls.disconnect();
        mobileDiv.classList.add('hidden');
    };
}

// 3) AR (WebXR immersive-ar)
async function initAR() {
    cleanupControls();
    if (!navigator.xr) {
        errorDiv.textContent = 'WebXR not supported. Try Desktop or Mobile VR mode.';
        errorDiv.classList.remove('hidden');
        setTimeout(() => errorDiv.classList.add('hidden'), 4000);
        return;
    }
    try {
        const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'] });
        renderer.xr.setSession(session);
        // For AR we need to place the maze on a detected plane.
        // Simplified: place at origin, allow user to walk around (requires ARKit/ARCore).
        // But to keep demo functional, we just show a message.
        errorDiv.textContent = 'AR mode active – maze placed at floor level. Walk around it!';
        errorDiv.classList.remove('hidden');
        setTimeout(() => errorDiv.classList.add('hidden'), 3000);
        mazeGroup.position.set(0, 0, 0);
        camera.position.set(offsetX, 1.6, offsetZ);
        // No additional controls needed; user physically moves.
        session.addEventListener('end', () => {
            renderer.xr.setSession(null);
        });
        currentControls = { disconnect: () => session.end() };
    } catch (err) {
        errorDiv.textContent = `AR failed: ${err.message}. Use Desktop or Mobile VR.`;
        errorDiv.classList.remove('hidden');
        setTimeout(() => errorDiv.classList.add('hidden'), 5000);
        console.error(err);
    }
}

function cleanupControls() {
    if (currentControls && currentControls.disconnect) currentControls.disconnect();
    // hide mobile buttons
    document.getElementById('mobile-controls').classList.add('hidden');
    const lockBtn = document.getElementById('controls-lock');
    if (lockBtn) lockBtn.style.display = 'none';
}

// UI button handlers
document.getElementById('btn-desktop').addEventListener('click', initDesktop);
document.getElementById('btn-mobile-vr').addEventListener('click', initMobileVR);
document.getElementById('btn-ar').addEventListener('click', initAR);

// Initial call – default to desktop (or detect mobile? we let user choose)
initDesktop();

// Animation loop
let time = 0;
function animate() {
    requestAnimationFrame(animate);
    time += 0.016;
    exitObj.rotation.y += 0.03;
    if (!hintShown) hintMat.emissiveIntensity = 0.6 + Math.sin(time * 8) * 0.4;
    if (orientationControls) orientationControls.update();
    renderer.render(scene, camera);
}
animate();