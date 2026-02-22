const canvas = document.getElementById('playground');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 8;
const TILES_WIDTH = 40;
const TILES_HEIGHT = 24;
const DISPLAY_WIDTH = TILE_SIZE * TILES_WIDTH;  // 320 game pixels
const DISPLAY_HEIGHT = TILE_SIZE * TILES_HEIGHT;  // 192 game pixels

const SMALL_BALL_SIZE = 11;  // game pixels
const BIG_BALL_SIZE = 16;    // game pixels

// Camera system
const camera = {
    x: 0,
    y: 0
};

const CAMERA_DEAD_ZONE_X = DISPLAY_WIDTH * 0.3;  // 30% from edges
const CAMERA_DEAD_ZONE_Y = DISPLAY_HEIGHT * 0.3;

function resize() {
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const gameAspectRatio = DISPLAY_WIDTH / DISPLAY_HEIGHT;
    const containerAspectRatio = containerWidth / containerHeight;
    
    let canvasWidth, canvasHeight;
    
    if (containerAspectRatio > gameAspectRatio) {
        // Container is wider, fit by height
        canvasHeight = containerHeight;
        canvasWidth = canvasHeight * gameAspectRatio;
    } else {
        // Container is taller, fit by width
        canvasWidth = containerWidth;
        canvasHeight = canvasWidth / gameAspectRatio;
    }
    
    // Set canvas resolution
    canvas.width = DISPLAY_WIDTH;
    canvas.height = DISPLAY_HEIGHT;
    
    // Set canvas display size
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
}

window.addEventListener('resize', resize);
resize();

function loadImage(name) {
    const img = new Image();
    img.src = `assets/image/${name}`;
    img.addEventListener('error', () => {
        console.error('Failed to load image:', img.src);
    });
    return img;
}

let tilemap = [];

const brickImg = loadImage('brick.png');
const bigBallImg = loadImage('big-ball.png');
const smallBallImg = loadImage('small-ball.png');

// Player object
// Player object
const player = {
    x: 0,
    y: 0,
    state: 'big', // 'big' or 'small'
    velocityX: 0,
    velocityY: 0,
    isJumping: false,
    moveLeft: false,
    moveRight: false,
    getWidth() {
        return this.state === 'big' ? BIG_BALL_SIZE : SMALL_BALL_SIZE;
    },
    getHeight() {
        return this.state === 'big' ? BIG_BALL_SIZE : SMALL_BALL_SIZE;
    },
    getRadius() {
        return this.getWidth() / 2;
    }
};

const GRAVITY = 0.3;
const MOVE_SPEED = 1.5;
const JUMP_STRENGTH = -6;
const BOUNCE_ELASTICITY = 0.4;
const FRICTION = 0.02;

async function loadTilemap(path) {
    try {
        const res = await fetch(path);
        if (!res.ok) {
            console.error('Failed to fetch tilemap:', path, res.status);
            return;
        }
        const text = await res.text();
        tilemap = text.replace(/\r/g, '').split('\n').filter(line => line.length > 0);
        
        // Find player position
        for (let ty = 0; ty < tilemap.length; ty++) {
            const row = tilemap[ty];
            for (let tx = 0; tx < row.length; tx++) {
                if (row[tx] === 'p') {
                    player.x = tx * TILE_SIZE;
                    player.y = ty * TILE_SIZE;
                }
            }
        }
    } catch (err) {
        console.error('Error loading tilemap:', err);
    }
}

loadTilemap('assets/tilemaps/level1.lvl');

// Keyboard input handling
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        player.moveLeft = true;
        e.preventDefault();
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        player.moveRight = true;
        e.preventDefault();
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        if (!player.isJumping) {
            player.velocityY = JUMP_STRENGTH;
            player.isJumping = true;
        }
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        player.moveLeft = false;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        player.moveRight = false;
    }
});

// Update camera to follow player with dead zone
function updateCamera() {
    const playerRadius = player.getRadius();
    const playerCenterX = player.x + playerRadius;
    const playerCenterY = player.y + playerRadius;
    
    // Get desired camera position (centered on player)
    const desiredCameraX = playerCenterX - DISPLAY_WIDTH / 2;
    const desiredCameraY = playerCenterY - DISPLAY_HEIGHT / 2;
    
    // Apply dead zone - only move camera if player gets too close to edges
    const currentScreenSpaceX = playerCenterX - camera.x;
    const currentScreenSpaceY = playerCenterY - camera.y;
    
    const minX = CAMERA_DEAD_ZONE_X;
    const maxX = DISPLAY_WIDTH - CAMERA_DEAD_ZONE_X;
    const minY = CAMERA_DEAD_ZONE_Y;
    const maxY = DISPLAY_HEIGHT - CAMERA_DEAD_ZONE_Y;
    
    if (currentScreenSpaceX < minX) {
        camera.x = playerCenterX - minX;
    } else if (currentScreenSpaceX > maxX) {
        camera.x = playerCenterX - maxX;
    }
    
    if (currentScreenSpaceY < minY) {
        camera.y = playerCenterY - minY;
    } else if (currentScreenSpaceY > maxY) {
        camera.y = playerCenterY - maxY;
    }
    
    // Clamp camera to world bounds
    const worldWidth = tilemap.length > 0 ? tilemap[0].length * TILE_SIZE : DISPLAY_WIDTH;
    const worldHeight = tilemap.length * TILE_SIZE;
    
    camera.x = Math.floor(Math.max(0, Math.min(camera.x, worldWidth - DISPLAY_WIDTH)));
    camera.y = Math.floor(Math.max(0, Math.min(camera.y, worldHeight - DISPLAY_HEIGHT)));
}

// Check if tile is solid (brick)
function isSolidTile(tx, ty) {
    if (ty < 0 || ty >= tilemap.length || tx < 0 || tx >= tilemap[ty].length) {
        return false;
    }
    return tilemap[ty][tx] === 'v';
}

// Circle-to-rectangle collision detection
function checkCircleRectCollision(circleX, circleY, radius, rectX, rectY, rectW, rectH) {
    // Find closest point on rectangle to circle center
    const closestX = Math.max(rectX, Math.min(circleX, rectX + rectW));
    const closestY = Math.max(rectY, Math.min(circleY, rectY + rectH));
    
    // Calculate distance between circle center and closest point
    const distX = circleX - closestX;
    const distY = circleY - closestY;
    const distSquared = distX * distX + distY * distY;
    
    return distSquared < radius * radius;
}

// Detect collision with tiles and return collision info (normal and depth)
function detectCollision(centerX, centerY, radius) {
    const left = Math.floor((centerX - radius) / TILE_SIZE);
    const right = Math.floor((centerX + radius) / TILE_SIZE);
    const top = Math.floor((centerY - radius) / TILE_SIZE);
    const bottom = Math.floor((centerY + radius) / TILE_SIZE);
    
    let collision = null;
    let minDepth = Infinity;
    
    for (let ty = top; ty <= bottom; ty++) {
        for (let tx = left; tx <= right; tx++) {
            if (isSolidTile(tx, ty)) {
                const tileX = tx * TILE_SIZE;
                const tileY = ty * TILE_SIZE;
                
                // Find closest point on tile to circle center
                const closestX = Math.max(tileX, Math.min(centerX, tileX + TILE_SIZE));
                const closestY = Math.max(tileY, Math.min(centerY, tileY + TILE_SIZE));
                
                const dx = centerX - closestX;
                const dy = centerY - closestY;
                const distance = Math.hypot(dx, dy);
                
                if (distance < radius && distance < minDepth) {
                    minDepth = distance;
                    const depth = radius - distance;
                    const len = distance || 1;
                    collision = {
                        depth: depth,
                        normalX: dx / len,
                        normalY: dy / len
                    };
                }
            }
        }
    }
    
    return collision;
}

// Check collision with tiles using circle collider
function checkCollisions(centerX, centerY, radius) {
    // Get nearby tiles that could collide
    const left = Math.floor((centerX - radius) / TILE_SIZE);
    const right = Math.floor((centerX + radius) / TILE_SIZE);
    const top = Math.floor((centerY - radius) / TILE_SIZE);
    const bottom = Math.floor((centerY + radius) / TILE_SIZE);
    
    for (let ty = top; ty <= bottom; ty++) {
        for (let tx = left; tx <= right; tx++) {
            if (isSolidTile(tx, ty)) {
                const rectX = tx * TILE_SIZE;
                const rectY = ty * TILE_SIZE;
                if (checkCircleRectCollision(centerX, centerY, radius, rectX, rectY, TILE_SIZE, TILE_SIZE)) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Update player physics
function updatePlayer() {
    const playerRadius = player.getRadius();
    const playerCenterX = player.x + playerRadius;
    const playerCenterY = player.y + playerRadius;
    
    // Horizontal movement
    if (player.moveLeft) {
        player.velocityX = -MOVE_SPEED;
    } else if (player.moveRight) {
        player.velocityX = MOVE_SPEED;
    } else {
        player.velocityX *= (1 - FRICTION);
    }
    
    // Apply horizontal movement
    const newX = player.x + player.velocityX;
    const newCenterX = newX + playerRadius;
    if (!checkCollisions(newCenterX, playerCenterY, playerRadius)) {
        player.x = newX;
    }
    
    // Apply gravity
    player.velocityY += GRAVITY;
    
    // Try vertical movement
    const newY = player.y + player.velocityY;
    const newCenterY = newY + playerRadius;
    
    player.y = newY;
    
    // Check collision with detailed response
    const collision = detectCollision(player.x + playerRadius, newCenterY, playerRadius);
    
    if (collision) {
        // Separate ball from collision
        const separationX = collision.normalX * collision.depth;
        const separationY = collision.normalY * collision.depth;
        player.x += separationX;
        player.y += separationY;
        
        // Calculate reflection with angle-based deflection
        const dotProduct = player.velocityX * collision.normalX + player.velocityY * collision.normalY;
        
        if (dotProduct < 0) { // Ball moving toward surface
            // Reflect velocity
            const reflectX = player.velocityX - 2 * dotProduct * collision.normalX;
            const reflectY = player.velocityY - 2 * dotProduct * collision.normalY;
            
            // Apply bounce elasticity
            player.velocityX = reflectX * BOUNCE_ELASTICITY;
            player.velocityY = reflectY * BOUNCE_ELASTICITY;
            
            // If mostly vertical collision, allow jumping
            if (Math.abs(collision.normalY) > 0.7) {
                player.velocityY = Math.max(0, player.velocityY);
                player.isJumping = false;
            }
        }
    }
}

function drawPlayer() {
    const img = player.state === 'big' ? bigBallImg : smallBallImg;
    const playerWidth = player.getWidth();
    const playerHeight = player.getHeight();
    // Convert to integer coordinates for pixel-perfect rendering
    const renderX = Math.floor(player.x - camera.x);
    const renderY = Math.floor(player.y - camera.y);
    if (img && img.complete && img.naturalWidth !== 0) {
        ctx.drawImage(img, renderX, renderY, playerWidth, playerHeight);
    } else {
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(renderX, renderY, playerWidth, playerHeight);
    }
}

function animate() {

    // clear viewport
    ctx.clearRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);

    // Update player physics
    updatePlayer();
    
    // Update camera to follow player
    updateCamera();

    // Draw game tiles with camera offset
    if (tilemap && tilemap.length) {
        // Calculate visible tile range
        const minTileX = Math.floor(camera.x / TILE_SIZE);
        const maxTileX = Math.ceil((camera.x + DISPLAY_WIDTH) / TILE_SIZE);
        const minTileY = Math.floor(camera.y / TILE_SIZE);
        const maxTileY = Math.ceil((camera.y + DISPLAY_HEIGHT) / TILE_SIZE);
        
        for (let ty = minTileY; ty < maxTileY && ty < tilemap.length; ty++) {
            if (ty < 0) continue;
            const row = tilemap[ty];
            for (let tx = minTileX; tx < maxTileX && tx < row.length; tx++) {
                if (tx < 0) continue;
                const ch = row[tx];
                if (ch === 'v') {
                    const screenX = tx * TILE_SIZE - camera.x;
                    const screenY = ty * TILE_SIZE - camera.y;
                    if (brickImg && brickImg.complete && brickImg.naturalWidth !== 0) {
                        ctx.drawImage(brickImg, screenX, screenY, TILE_SIZE, TILE_SIZE);
                    } else {
                        ctx.fillStyle = '#b0463b';
                        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
    }

    // Draw player
    drawPlayer();

    requestAnimationFrame(animate);
}

animate();
