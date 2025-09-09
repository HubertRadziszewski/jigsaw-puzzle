// Fishing Jigsaw — no-rotation, 4×6 board, chest, confirm modals

// ======= Config =======
const COLS = 6, ROWS = 4; // 6 columns × 4 rows
const CELL_COUNT = COLS * ROWS; // 24
const ASSETS = {
  chest: 'assets/chest.png',       // provide any chest image here
  reward: 'assets/reward.png',     // optional
};

// Define pieces. Each piece has: id, name, size in cells (w,h),
// coords: array of [x,y] offsets (0,0 is top-left of the piece), and sprite path.
const PIECES = [
  {
    id: 'O1', name: '1x1', w: 1, h: 1, sprite: 'assets/pieces/orange_1x1.png',
    coords: [[0,0]],
  },
  {
    id: 'LINE3', name: '3x1 line', w: 3, h: 1, sprite: 'assets/pieces/blue_3x1.png',
    coords: [[0,0],[1,0],[2,0]],
  },
  {
    id: 'S', name: 'S shape', w: 3, h: 2, sprite: 'assets/pieces/red_s.png',
    coords: [[1,0],[2,0],[0,1],[1,1]], // classic S tetromino
  },
  {
    id: 'SQ2', name: '2x2 square', w: 2, h: 2, sprite: 'assets/pieces/cyan_2x2.png',
    coords: [[0,0],[1,0],[0,1],[1,1]],
  },
  {
    id: 'J', name: 'J shape', w: 2, h: 2, sprite: 'assets/pieces/yellow_j.png',
    coords: [[1,0],[0,1],[1,1]],
  },
  {
    id: 'L', name: 'L shape', w: 2, h: 2, sprite: 'assets/pieces/green_l.png',
    coords: [[0,0],[0,1],[1,1]],
  },
];

// ======= State =======
const boardEl = document.getElementById('board');
const ghostEl = document.getElementById('ghost');
const chestBtn = document.getElementById('chestBtn');
const rewardSlot = document.getElementById('rewardSlot');
const moveCountEl = document.getElementById('moveCount');
const filledCountEl = document.getElementById('filledCount');
const resetBtn = document.getElementById('resetBtn');

const modalEl = document.getElementById('modal');
const modalTitleEl = document.getElementById('modalTitle');
const modalMsgEl = document.getElementById('modalMsg');
const modalYesBtn = document.getElementById('modalYes');
const modalNoBtn = document.getElementById('modalNo');

let cells = []; // array of {occupied:boolean}
let holding = null; // current piece object {piece, x, y}
let cellSize = 0; // px, computed
let moves = 0; let filled = 0; // number of occupied cells

// ======= Utilities =======
function idx(x,y){ return y*COLS + x; }
function inBounds(x,y){ return x>=0 && x<COLS && y>=0 && y<ROWS; }
function updateHUD(){ moveCountEl.textContent = String(moves); filledCountEl.textContent = String(filled); }
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

// Simple modal confirm that returns a Promise<boolean>
function confirmModal(title, msg){
  modalTitleEl.textContent = title; modalMsgEl.textContent = msg; show(modalEl);
  return new Promise(resolve => {
    const onYes = () => { cleanup(); resolve(true); };
    const onNo = () => { cleanup(); resolve(false); };
    function cleanup(){
      hide(modalEl);
      modalYesBtn.removeEventListener('click', onYes);
      modalNoBtn.removeEventListener('click', onNo);
    }
    modalYesBtn.addEventListener('click', onYes);
    modalNoBtn.addEventListener('click', onNo);
  });
}

// ======= Board Setup =======
function buildBoard(){
  boardEl.innerHTML = '';
  cells = [];
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      const div = document.createElement('div');
      div.className = 'cell';
      div.dataset.x = x; div.dataset.y = y;
      boardEl.appendChild(div);
      cells.push({ el: div, occupied:false });
    }
  }
  // compute cell size from first cell
  requestAnimationFrame(()=>{
    const rect = cells[0].el.getBoundingClientRect();
    cellSize = rect.width + 2; // include grid gap approx
  });
}

// ======= Chest / Spawn =======
async function onChestClick(){
  if(holding) return; // already holding
  const ok = await confirmModal('Do you want to use this?', 'Open the chest to draw a random piece?');
  if(!ok) return;
  const piece = randomPiece();
  startHolding(piece);
}

function randomPiece(){
  return PIECES[Math.floor(Math.random()*PIECES.length)];
}

function startHolding(piece){
  holding = { piece, x:0, y:0 };
  ghostEl.style.backgroundImage = `url(${piece.sprite})`;
  ghostEl.style.width = piece.w*100 + '%'; // will be scaled below
  ghostEl.style.height = piece.h*100 + '%';
  show(ghostEl);
}

function stopHolding(){ holding = null; hide(ghostEl); }

// ======= Placement =======
function canPlaceAt(px,py,piece){
  for(const [dx,dy] of piece.coords){
    const x = px + dx; const y = py + dy;
    if(!inBounds(x,y)) return false;
    if(cells[idx(x,y)].occupied) return false;
  }
  return true;
}

function placeAt(px,py,piece){
  for(const [dx,dy] of piece.coords){
    const x = px + dx; const y = py + dy; const c = cells[idx(x,y)];
    c.occupied = true; c.el.classList.add('occupied');
  }
  filled += piece.coords.length;
  moves += 1;
  updateHUD();
  checkWin();
}

function checkWin(){
  if(filled >= CELL_COUNT){
    // Show reward
    rewardSlot.innerHTML = '';
    const img = document.createElement('img');
    img.alt = 'Reward'; img.style.width = '90%'; img.style.height='90%'; img.style.objectFit='contain';
    img.src = ASSETS.reward; // if missing, fallback text
    rewardSlot.appendChild(img);
    confirmModal('Fishing Jigsaw', 'You filled the entire board—nice!');
  }
}

// ======= Mouse handling =======
boardEl.addEventListener('mousemove', (e)=>{
  if(!holding) return;
  const rect = boardEl.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / (rect.width / COLS));
  const y = Math.floor((e.clientY - rect.top) / (rect.height / ROWS));
  holding.x = Math.max(0, Math.min(COLS-1, x));
  holding.y = Math.max(0, Math.min(ROWS-1, y));
  // Position ghost snapped to anchor cell
  const cellRect = cells[idx(holding.x, holding.y)].el.getBoundingClientRect();
  const gRect = boardEl.getBoundingClientRect();
  ghostEl.style.left = (cellRect.left - gRect.left) + 'px';
  ghostEl.style.top  = (cellRect.top  - gRect.top ) + 'px';
  // Scale ghost to grid cells
  ghostEl.style.width = (cellRect.width * holding.piece.w + 2*(holding.piece.w-1)) + 'px';
  ghostEl.style.height= (cellRect.height* holding.piece.h + 2*(holding.piece.h-1)) + 'px';
  // Validity feedback
  ghostEl.classList.toggle('invalid', !canPlaceAt(holding.x, holding.y, holding.piece));
});

boardEl.addEventListener('mouseleave', ()=>{
  if(holding) ghostEl.classList.add('hidden');
});
boardEl.addEventListener('mouseenter', ()=>{
  if(holding) ghostEl.classList.remove('hidden');
});

// Left click to attempt placement
boardEl.addEventListener('click', async (e)=>{
  if(!holding) return;
  const ok = await confirmModal('Do you want to add this?', 'Place this piece here?');
  if(!ok) return;
  if(canPlaceAt(holding.x, holding.y, holding.piece)){
    placeAt(holding.x, holding.y, holding.piece);
    stopHolding();
  } else {
    // Invalid spot feedback
    confirmModal('Invalid placement', 'That piece does not fit there.');
  }
});

// Right click to attempt drop
window.addEventListener('contextmenu', (e)=>{
  if(holding){ e.preventDefault(); onDropAttempt(); }
});

async function onDropAttempt(){
  const ok = await confirmModal('Do you want to drop this?', 'Discard the current piece?');
  if(ok) stopHolding();
}

// Chest + reset
chestBtn.addEventListener('click', onChestClick);
resetBtn.addEventListener('click', ()=>{
  buildBoard();
  stopHolding();
  moves = 0; filled = 0; updateHUD();
  rewardSlot.innerHTML = '<span class="reward-placeholder">Reward</span>';
});

//
