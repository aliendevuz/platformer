const info = document.getElementById('info');
const canvas = document.getElementById('playground');
const ctx = canvas.getContext('2d');

// Keyboard input
const keys = {};

window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

// rescale canvas
function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

window.addEventListener('resize', resize);
resize();

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
        const size = 40;
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

// draw vector image
function drawVectorImage(x, y, width, height, type) {
    ctx.save();  // Save current context state
    
    ctx.translate(x, y);  // Move to the image's position

    // Circle drawing
    if (type === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, width / 2, 0, Math.PI * 2);  // Draw a circle
        ctx.fillStyle = '#ce1420';  // Color for circle
        ctx.fill();
        ctx.strokeStyle = '#8b0d16';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(-(width / 5), -(width / 5), width / 5, 0, Math.PI * 2);  // Draw a circle
        ctx.fillStyle = '#ffc5c8';  // Color for circle
        ctx.fill();
    }

    // Rectangle drawing
    else if (type === 'rectangle') {
        ctx.fillStyle = '#33ff57';  // Color for rectangle
        ctx.fillRect(-width / 2, -height / 2, width, height);  // Draw a rectangle
        // ctx.stroke();
    }

    // Complex shape (Example: Circle + Rectangle composition)
    else if (type === 'circle+rectangle') {
        // Draw a circle
        ctx.beginPath();
        ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ff5733';
        ctx.fill();
        ctx.stroke();

        // Draw a rectangle over it
        ctx.fillStyle = '#33ff57';
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.stroke();
    }

    // Restore context to prevent the transformations from affecting other drawings
    ctx.restore();
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
            ctx.drawImage(this.img, (this.x - camera.x) * camera.scale, (this.y - camera.y) * camera.scale, this.w * camera.scale, this.h * camera.scale);
        }
    }
}

class Camera {
    constructor(x, y, w, h, scale) {
        this.x = x; // Camera's x position in world coordinates
        this.y = y; // Camera's y position in world coordinates
        this.w = w;
        this.h = h;
        this.scale = scale;
        this.lerpSpeed = 0.1;
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    setPos(x, y) {

        try {
            this.x = x - this.w / 2 / this.scale;
            this.y = y - this.h / 2 / this.scale;
        } catch (err) {
            console.log("Something went wrong on camera setPos!");
        }
    }

    update(target) {

        try {
            // Calculate the desired camera position
            const targetX = target.x - this.w / 2 / this.scale;
            const targetY = target.y - this.h / 2 / this.scale;

            // Smoothly interpolate the camera's current position towards the target position
            this.x = Math.floor(this.lerp(this.x, targetX, this.lerpSpeed));
            this.y = Math.floor(this.lerp(this.y, targetY, this.lerpSpeed));
            
            // // Prevent camera from going outside the world bounds
            // const mapWidth = tilemap[0].length * 4; // 4 is the tile size
            // const mapHeight = tilemap.length * 4;
            
            // // Clamp camera position within the world bounds
            // this.x = Math.max(0, Math.min(this.x, mapWidth - this.width));
            // this.y = Math.max(0, Math.min(this.y, mapHeight - this.height));
        } catch (err) {
            console.log("Something went wrong on camera update!");
        }
    }
}

class Player extends GameObject {
    constructor(x, y, img, radius) {
        super(x, y, radius * 2, radius * 2, img);
        this.radius = radius;
    }

    setPos(x, y) {
        this.x = x;
        this.y = y;
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    // draw(camera) {
    //     drawVectorImage(this.x - camera.x, this.y - camera.y, this.w * camera.scale, this.h * camera.scale, 'circle');
    // }
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

    // draw(camera) {
    //     if (this.img != null) {
    //         drawVectorImage(this.x - camera.x, this.y - camera.y, this.w, this.h, 'rectangle');
    //     }
    // }
}

// game objects
const camera = new Camera(0, 0, canvas.width, canvas.height, 1.0);
let tilemap = [];
const player = new Player(0, 0, bigBall, 16);

function initGame() {
    // initialize game
    loadTilemap('assets/tilemaps/level1.lvl').then(t => {
        tilemap = t;
        
        // Find player start position
        for (let y = 0; y < t.length; y++) {
            for (let x = 0; x < t[y].length; x++) {
                if (t[y][x].tile === 'p') {
                    player.setPos(x * 40, y * 40);
                    camera.setPos(player.x, player.y);
                    break;
                }
            }
        }
    });
}

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
    info.textContent = `${camera.x}, ${camera.y}, ${player.x}, ${player.y}`;
    player.draw(camera);
}

function animate() {

    // clear screen
    clearScreen();

    // control
    handleEvent();

    // update player
    updateGame();
    
    // update camera
    updateCamera();

    // draw game
    drawGame();

    requestAnimationFrame(animate);
}

initGame();
animate();
