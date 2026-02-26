const canvas = document.getElementById('playground');
const ctx = canvas.getContext('2d');
const btn = document.getElementById('fullscreen-btn');

let RESOLUTION = window.devicePixelRatio || 1;
let isReady = false;

// Keyboard input
const keys = {};

window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

document.addEventListener('touchmove', function(e) {
    e.preventDefault(); // Telegram WebView ichida ham scrollni bloklaydi
}, { passive: false });

if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
    // btn.style.display = 'block';
}

btn.addEventListener('click', () => {
    canvas.requestFullscreen?.() ||
    canvas.webkitRequestFullscreen?.() ||
    canvas.msRequestFullscreen?.();
    btn.style.display = 'none';

    resize();
});

// Right-click / context menu bloklash
document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
});

// Mouse wheel + Ctrl (zoom) bloklash
document.addEventListener('wheel', function(e) {
    if (e.ctrlKey) e.preventDefault(); 
}, { passive: false });

// loadAssets
function loadImage(name) {
    const image = new Image();
    image.src = `assets/image/${name}`;
    image.addEventListener('error', () => {
        console.error('Failed to load image:', image.src);
    });
    return image;
}

const imageBrick = loadImage('brick.svg');
const bigBall = loadImage('big-ball.svg');

// clear screen
function clearScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Function to load tilemap from file
async function loadTilemap(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        const lines = text.trim().split('\n');
        const size = TILE_SIZE;
        const tilemap = lines.map((line, rowIndex) => {
            return line.split('').map((char, colIndex) => {
                return new Tile(colIndex * size, rowIndex * size, size, size, char);
            });
        });
        return tilemap;
    } catch (error) {
        console.error('Error loading tilemap:', error);
        return [];
    }
}

// game classes
class GameObject {
    constructor(x, y, w, h, img) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.img = img;
    }

    draw(camera) {
        if (this.img != null) {
            ctx.drawImage(
                this.img,
                (this.x - camera.x) * camera.scale,
                (this.y - camera.y) * camera.scale,
                this.w * camera.scale,
                this.h * camera.scale
            );
        }
    }

    resize({w, h}) {
        this.w = w;
        this.h = h;
    }
}

class Camera {
    constructor(x, y, w, h, scale) {
        this.x = x;
        this.y = y;
        this.scale = scale;
        this.w = w / scale;
        this.h = h / scale;
        this.lerpSpeed = 0.1;
    }

    resize({w, h, scale}) {
        this.scale = scale;
        this.w = w / scale;
        this.h = h / scale;
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    setPos(target) {
        this.x = target.x - this.w / 2 + target.w / 2;
        this.y = target.y - this.h / 2 + target.h / 2;
    }

    update(target) {
        // Calculate the desired camera position
        const targetX = target.x - this.w / 2 + target.w / 2;
        const targetY = target.y - this.h / 2 + target.h / 2;

        // Smoothly interpolate the camera's current position towards the target position
        this.x = this.lerp(this.x, targetX, this.lerpSpeed);
        this.y = this.lerp(this.y, targetY, this.lerpSpeed);
    }
}

class Player extends GameObject {
    constructor(x, y, img, radius) {
        super(x, y, radius * 2, radius * 2, img);
        this.radius = radius;
    }

    resize(radius) {
        super.resize({w: radius * 2, h: radius * 2})
    }

    setPos(x, y) {
        this.x = x;
        this.y = y;
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }
}

class Tile extends GameObject {
    constructor(x, y, w, h, tile) {
        let img = null;
        if (tile === 'v') {
            img = imageBrick;
        } else if (tile === '.') {
            // nothing
        }
        super(x, y, w, h, img);
        this.tile = tile;
    }
}

// game objects
const MIN_WIDTH = 14;
const MIN_HEIGHT = 11;

let TILE_SIZE = 0;

const rect = canvas.parentElement.getBoundingClientRect();
const {width, height} = rect;

const TILE_WIDTH = width / MIN_WIDTH;
const TILE_HEIGHT = height / MIN_HEIGHT;

if (TILE_WIDTH < TILE_HEIGHT) {
    TILE_SIZE = TILE_WIDTH;
} else {
    TILE_SIZE = TILE_HEIGHT;
}

const scale = 1;
const camera = new Camera(0, 0, canvas.width, canvas.height, scale * RESOLUTION);

let tilemap = [];

const player = new Player(0, 0, bigBall, TILE_SIZE / 2);

// rescale canvas
function resize() {
    
    RESOLUTION = window.devicePixelRatio || 1;
    
    const rect = canvas.parentElement.getBoundingClientRect();
    const {width, height} = rect;

    const TILE_WIDTH = width / MIN_WIDTH;
    const TILE_HEIGHT = height / MIN_HEIGHT;

    if (TILE_WIDTH < TILE_HEIGHT) {
        TILE_SIZE = TILE_WIDTH;
    } else {
        TILE_SIZE = TILE_HEIGHT;
    }

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    canvas.width = Math.round(width * RESOLUTION);
    canvas.height = Math.round(height * RESOLUTION);

    // document.getElementById("info").textContent = `${RESOLUTION} | ${canvas.width} : ${canvas.height}`;

    camera.resize({w: canvas.width, h: canvas.height, scale: scale * RESOLUTION});

    loadTilemap('assets/tilemaps/level1.lvl').then(t => {
        tilemap = t;
        
        // Find player start position
        for (let y = 0; y < t.length; y++) {
            for (let x = 0; x < t[y].length; x++) {
                if (t[y][x].tile === 'p') {
                    player.setPos(x * TILE_SIZE, y * TILE_SIZE);
                    camera.setPos(player)
                    break;
                }
            }
        }
    });
    
    player.resize(TILE_SIZE / 2)

    
    setTimeout(() => {
        isReady = true;
        document.body.style.opacity = 1;
    }, 200)
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
}

resize();

function handleEvent() {
    const speed = 2; // Movement speed
    let run = 1;

    if (keys['Shift']) {
        run = 3;
    }

    if (keys['ArrowUp'] || keys['w']) {
        player.move(0, -speed * run);
    }
    if (keys['ArrowDown'] || keys['s']) {
        player.move(0, speed * run);
    }
    if (keys['ArrowLeft'] || keys['a']) {
        player.move(-speed * run, 0);
    }
    if (keys['ArrowRight'] || keys['d']) {
        player.move(speed * run, 0);
    }
}

function updateGame() {

}

function updateCamera() {
    camera.update(player);
}

function drawGame() {
    // Draw tiles based on camera's position
    for (let y = 0; y < tilemap.length; y++) {
        for (let x = 0; x < tilemap[y].length; x++) {
            // Translate the tile's world position by the camera's position
            tilemap[y][x].draw(camera); // Assuming `draw` method of `Tile` accepts x, y offsets
        }
    }

    // Draw the player at the camera's adjusted position
    player.draw(camera);
}

function animate() {

    // clear screen
    clearScreen();

    if (isReady) {

        // control
        handleEvent();
    
        // update player
        updateGame();
        
        // update camera
        updateCamera();
    
        // draw game
        drawGame();
    }

    requestAnimationFrame(animate);
}

animate();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .catch(() => {
      console.log("SW qo'llab-quvvatlanmadi");
    });
}
