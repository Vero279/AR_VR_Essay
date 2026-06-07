import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// ---------- Maze definition (same as before) ----------
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

// ---------- Three.js setup ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1030);
scene.fog = new THREE.FogExp2(0x0a1030, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;          // enable WebXR
document.body.appendChild(renderer.domElement);

// ---------- Lighting ----------
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

// ---------- Build the maze as a group (so we can reposition in AR) ----------
const mazeGroup = new THREE.Group();
scene.add(mazeGroup);

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2a1f, roughness: 0.8 });
const wallColliders = []; // store boxes in world coordinates – will update after placing group

function buildMaze() {
    // clear previous
    while(mazeGroup.children.length) mazeGroup.remove(mazeGroup.children[0]);
    wallColliders.length = 0;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = offsetX + col * CELL_SIZE;
            const z = offsetZ + row * CELL_SIZE;
            
            // floor
            const floor = new THREE.Mesh(
                new THREE.BoxGeometry(CELL_SIZE, 0.1, CELL_SIZE),
                floorMaterial
            );
            floor.position.set(x, -0.05, z);
            floor.receiveShadow = true;
            mazeGroup.add(floor);
            
            if (mazeGrid[row][col] === 1) {
                const wall = new THREE.Mesh(
                    new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE),
                    wallMaterial
                );
                wall.position.set(x, WALL_HEIGHT/2, z);
                wall.castShadow = true;
                wall.receiveShadow = true;
                mazeGroup.add(wall);
                
                // collider (local to mazeGroup)
                const box = new THREE.Box3().setFromObject(wall);
                wallColliders.push(box);
            }
        }
    }
}
buildMaze();

// Hint sphere (glowing)
const hintRow = 2, hintCol = 2;
const hintPosLocal = new THREE.Vector3(offsetX + hintCol * CELL_SIZE, 0.8, offsetZ + hintRow * CELL_SIZE);
const hintMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0x442200, emissiveIntensity: 0.8 });
const hintSphere = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), hintMat);
hintSphere.position.copy(hintPosLocal);
mazeGroup.add(hintSphere);

// Exit (golden cylinder)
const exitRow = 4, exitCol = 4;
const exitPosLocal = new THREE.Vector3(offsetX + exitCol * CELL_SIZE, 0.7, offsetZ + exitRow * CELL_SIZE);
const exitObj = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xffaa33, metalness: 0.9, roughness: 0.2, emissive: 0x442200 })
);
exitObj.position.copy(exitPosLocal);
mazeGroup.add(exitObj);

// ---------- Player representation for AR (a floating crystal) ----------
const playerCrystal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.4, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x44aaff, emissive: 0x004466 })
);
playerCrystal.castShadow = true;
mazeGroup.add(playerCrystal);
let currentPlayerCell = { row: 0, col: 0 }; // start at (0,0)
function updatePlayerPosition() {
    const pos = new THREE.Vector3(
        offsetX + currentPlayerCell.col * CELL_SIZE,
        0.3,
        offsetZ + currentPlayerCell.row * CELL_SIZE
    );
    playerCrystal.position.copy(pos);
}
updatePlayerPosition();

// ---------- Helper: grid cell from world position (relative to mazeGroup) ----------
function getCellFromLocalPos(localPos) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cx = offsetX + c * CELL_SIZE;
            const cz = offsetZ + r * CELL_SIZE;
            if (Math.abs(localPos.x - cx) < CELL_SIZE/2 && Math.abs(localPos.z - cz) < CELL_SIZE/2) {
                return { row: r, col: c };
            }
        }
    }
    return null;
}

function isWalkable(row, col) {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
    return mazeGrid[row][col] === 0;
}

// ---------- Game state ----------
let hintShown = false;
let gameWon = false;
const hintDiv = document.getElementById('hint-message');
const winDiv = document.getElementById('win-message');

function checkHintAndWin(row, col) {
    if (!hintShown && row === hintRow && col === hintCol) {
        hintShown = true;
        hintDiv.classList.remove('hidden');
        setTimeout(() => hintDiv.classList.add('hidden'), 4000);
        hintMat.emissiveIntensity = 0.2;
    }
    if (!gameWon && row === exitRow && col === exitCol) {
        gameWon = true;
        winDiv.classList.remove('hidden');
        if (renderer.xr.isPresenting) renderer.xr.getSession()?.end();
    }
}

// ---------- AR MODE (tap‑to‑move) ----------
let arSession = null;
let arHitTestSource = null;
const arControlsDiv = document.getElementById('ar-controls');

async function startAR() {
    if (!navigator.xr) { alert("WebXR not supported"); return; }
    try {
        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.body }
        });
        arSession = session;
        renderer.xr.setSession(session);
        
        // Setup hit test source
        const viewerSpace = await session.requestReferenceSpace('viewer');
        arHitTestSource = await session.requestHitTestSource({ space: viewerSpace });
        
        // Show UI
        document.getElementById('mode-buttons').style.display = 'none';
        arControlsDiv.classList.remove('hidden');
        
        session.addEventListener('end', () => {
            renderer.xr.setSession(null);
            arHitTestSource = null;
            arSession = null;
            document.getElementById('mode-buttons').style.display = 'flex';
            arControlsDiv.classList.add('hidden');
        });
        
        // Place maze on first detected plane
        let mazePlaced = false;
        function onFrame(time, frame) {
            if (!mazePlaced && arHitTestSource) {
                const hitTestResults = frame.getHitTestResults(arHitTestSource);
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const pose = hit.getPose(viewerSpace);
                    if (pose) {
                        // place maze group at hit point
                        mazeGroup.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
                        mazePlaced = true;
                    }
                }
            }
            // handle tapping
            // For simplicity, we use click/tap on screen -> raycast to maze cells
        }
        session.requestAnimationFrame(onFrame);
        
        // Tap handling: screen touch -> raycast from camera through mazeGroup
        const raycaster = new THREE.Raycaster();
        const tempVec = new THREE.Vector2();
        const onTouch = (e) => {
            if (!mazePlaced) return;
            e.preventDefault();
            const x = (e.touches ? e.touches[0].clientX : e.clientX) / window.innerWidth * 2 - 1;
            const y = -(e.touches ? e.touches[0].clientY : e.clientY) / window.innerHeight * 2 + 1;
            tempVec.set(x, y);
            raycaster.setFromCamera(tempVec, camera);
            const intersects = raycaster.intersectObjects(mazeGroup.children, true);
            for (let hit of intersects) {
                // find which cell (based on floor or wall?)
                const worldPoint = hit.point;
                const localPoint = mazeGroup.worldToLocal(worldPoint);
                const cell = getCellFromLocalPos(localPoint);
                if (cell && isWalkable(cell.row, cell.col)) {
                    currentPlayerCell = cell;
                    updatePlayerPosition();
                    checkHintAndWin(cell.row, cell.col);
                    break;
                }
            }
        };
        window.addEventListener('click', onTouch);
        session.addEventListener('end', () => window.removeEventListener('click', onTouch));
        
    } catch (err) {
        console.error(err);
        alert("AR failed: " + err.message);
    }
}

// ---------- VR MODE (teleportation) ----------
let vrSession = null;
let controller1, controller2;
let teleportRay = null;
let teleportTarget = null;

async function startVR() {
    if (!navigator.xr) { alert("WebXR not supported"); return; }
    try {
        const session = await navigator.xr.requestSession('immersive-vr', {
            requiredFeatures: ['local-floor']
        });
        vrSession = session;
        renderer.xr.setSession(session);
        document.getElementById('mode-buttons').style.display = 'none';
        
        // Create controllers
        const controllerModelFactory = new XRControllerModelFactory();
        controller1 = renderer.xr.getController(0);
        controller2 = renderer.xr.getController(1);
        controller1.addEventListener('selectstart', onTeleportStart);
        controller1.addEventListener('selectend', onTeleportEnd);
        controller2.addEventListener('selectstart', onTeleportStart);
        controller2.addEventListener('selectend', onTeleportEnd);
        scene.add(controller1);
        scene.add(controller2);
        
        // Helper line for teleport ray
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00aaff });
        teleportRay = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
        controller1.add(teleportRay);
        
        session.addEventListener('end', () => {
            renderer.xr.setSession(null);
            vrSession = null;
            document.getElementById('mode-buttons').style.display = 'flex';
            controller1.removeEventListener('selectstart', onTeleportStart);
            controller1.removeEventListener('selectend', onTeleportEnd);
            controller2.removeEventListener('selectstart', onTeleportStart);
            controller2.removeEventListener('selectend', onTeleportEnd);
            scene.remove(controller1);
            scene.remove(controller2);
        });
        
        // Teleport logic
        function onTeleportStart(event) {
            const controller = event.target;
            // show ray
            teleportRay.visible = true;
        }
        function onTeleportEnd(event) {
            teleportRay.visible = false;
            if (teleportTarget) {
                // move camera to target position (preserve height)
                const newPos = teleportTarget.clone();
                camera.position.copy(newPos);
                // also update player cell for hint/exit detection
                const localPos = mazeGroup.worldToLocal(camera.position);
                const cell = getCellFromLocalPos(localPos);
                if (cell) {
                    checkHintAndWin(cell.row, cell.col);
                }
                teleportTarget = null;
            }
        }
        
        // In VR, we must place the maze at origin (already there)
        mazeGroup.position.set(0, 0, 0);
        // Set camera starting position at start cell (0,0) local
        const startPos = new THREE.Vector3(offsetX, 1.6, offsetZ);
        camera.position.copy(startPos);
        
        // Animate teleport ray
        function updateTeleport() {
            if (!vrSession || !teleportRay.visible) return;
            const controller = controller1; // use first controller
            const tempMatrix = controller.matrixWorld;
            // ray direction from controller
            const origin = new THREE.Vector3().setFromMatrixPosition(tempMatrix);
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.quaternion);
            const raycaster = new THREE.Raycaster(origin, dir, 0, 5);
            const intersects = raycaster.intersectObjects(mazeGroup.children, true);
            let hitPoint = null;
            for (let hit of intersects) {
                const worldPoint = hit.point;
                const localPoint = mazeGroup.worldToLocal(worldPoint);
                const cell = getCellFromLocalPos(localPoint);
                if (cell && isWalkable(cell.row, cell.col)) {
                    // compute walkable center position
                    const cellCenter = new THREE.Vector3(offsetX + cell.col * CELL_SIZE, 0, offsetZ + cell.row * CELL_SIZE);
                    hitPoint = mazeGroup.localToWorld(cellCenter);
                    hitPoint.y = 1.6; // eye level
                    break;
                }
            }
            teleportTarget = hitPoint;
            // update line geometry
            if (hitPoint) {
                const points = [origin, hitPoint];
                const geom = new THREE.BufferGeometry().setFromPoints(points);
                teleportRay.geometry.dispose();
                teleportRay.geometry = geom;
            } else {
                teleportRay.geometry.dispose();
                teleportRay.geometry = new THREE.BufferGeometry();
            }
        }
        renderer.xr.addEventListener('sessionframe', () => updateTeleport());
        
    } catch (err) {
        console.error(err);
        alert("VR failed: " + err.message);
    }
}

// ---------- Attach UI buttons ----------
document.getElementById('enter-ar').addEventListener('click', startAR);
document.getElementById('enter-vr').addEventListener('click', startVR);

// Simple rotation animation for exit and hint pulse (non-XR frames)
let time = 0;
function animate() {
    time += 0.016;
    exitObj.rotation.y += 0.03;
    hintMat.emissiveIntensity = hintShown ? 0.2 : 0.6 + Math.sin(time * 8) * 0.4;
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

console.log("Ready – choose AR or VR mode.");