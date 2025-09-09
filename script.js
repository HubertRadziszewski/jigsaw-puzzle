// Fishing Jigsaw — no-rotation, 4×6 board, chest, confirm modals

// ======= Config =======
const COLS = 6, ROWS = 4;
const CELL_COUNT = COLS * ROWS;
const ASSETS = {
  chest: 'assets/chest.png',
  reward: 'assets/reward.png',
};

// Pieces (fixed orientation). LINE3 vertical. Red zig-zag mirrored to match sprite.
const PIECES = [
  { id: 'O1',   name: '1x1',        w:1, h:1, sprite:'assets/pieces/orange_1x1.png', coords:[[0,0]] },
  { id: 'LINE3',name: '3x1 line',   w:1, h:3, sprite:'assets/pieces/blue_3x1.png',   coords:[[0,0],[0,1],[0,2]] },
  { id: 'S',    name: 'S shape',    w:3, h:2, sprite:'assets/pieces/red_s.png',      coords:[[0,0],[1,0],[1,1],[2,1]] },
  { id: 'SQ2',  name: '2x2 square', w:2, h:2, sprite:'assets/pieces/cyan_2x2.png',   coords:[[0,0],[1,0],[0,1],[1,1]] },
  { id: 'J',    name: 'J shape',    w:2, h:2, sprite:'assets/pieces/yellow_j.png',   coords:[[0,0],[1,0],[1,1]] }, // mirror of L
  { id: 'L',    name: 'L shape',    w:2, h:2, sprite:'assets/pieces/green_l.png',    coords:[[0,0],[0,1],[1,1]] },
];

// ======= Elements / State =======
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

let cells = [];                  // [{el, occupied}]
let holding = null;              // { piece, x, y }
let moves = 0;
let filled = 0;

// ======= Helpers =======
function idx(x,y){ return y*COLS + x; }
function inBounds(x,y){ return x>=0 && x<COLS && y>=0 && y<ROWS; }
function updateHUD(){ moveCountEl.textContent = String(moves); filledCountEl.textContent = String(filled); }
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

// Read actual grid gaps from CSS
function getGridGaps() {
  const cs = getComputedStyle(boardEl);
  const colGap = parseFloat(cs.columnGap || cs.gap || '0') || 0;
  const rowGap = parseFloat(cs.rowGap    || cs.gap || '0') || 0;
  return { colGap, rowGap };
}

function confirmModal(title, msg){
  modalTitleEl.textContent = title; modalMsgEl.textContent = msg; show(modalEl);
  return new Promise(resolve => {
    const onYes = () => { cleanup(); resolve(true); };
    const onNo  = () => { cleanup(); resolve(false); };
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
}

// ======= Chest / Spawn =======
async function onChestClick(){
  if(holding) return;
  const ok = await confirmModal('Do you want to use this?', 'Open the chest to draw a random piece?');
  if(!ok) return;
  const piece = randomPiece();
  startHolding(piece);
}
function randomPiece(){ return PIECES[Math.floor(Math.random()*PIECES.length)]; }

function startHolding(piece){
  holding = { piece, x:0, y:0 };
  ghostEl.style.backgroundImage = `url(${piece.sprite})`;
  ghostEl.style.width = '0px';
  ghostEl.style.height = '0px';
  show(ghostEl);
}
function stopHolding(){ holding = null; hide(ghostEl); }

// ======= Placement / Rendering =======
function rectForFootprint(px,py,w,h){
  const anchor = cells[idx(px,py)].el;
  const { colGap, rowGap } = getGridGaps();

  const left   = Math.round(anchor.offsetLeft);
  const top    = Math.round(anchor.offsetTop);
  const cellW  = anchor.offsetWidth;
  const cellH  = anchor.offsetHeight;

  const width  = Math.round(cellW * w + colGap * (w - 1));
  const height = Math.round(cellH * h + rowGap * (h - 1));

  return { left, top, width, height };
}

function canPlaceAt(px,py,piece){
  for(const [dx,dy] of piece.coords){
    const x = px + dx, y = py + dy;
    if(!inBounds(x,y)) return false;
    if(cells[idx(x,y)].occupied) return false;
  }
  return true;
}

function renderPlaced(px,py,piece){
  const el = document.createElement('div');
  el.className = 'placed-piece';
  el.style.backgroundImage = `url(${piece.sprite})`;
  const r = rectForFootprint(px,py,piece.w,piece.h);
  el.style.left   = r.left  + 'px';
  el.style.top    = r.top   + 'px';
  el.style.width  = r.width + 'px';
  el.style.height = r.height+ 'px';
  boardEl.appendChild(el);
}

function placeAt(px,py,piece){
  for(const [dx,dy] of piece.coords){
    const x = px + dx, y = py + dy;
    const c = cells[idx(x,y)];
    c.occupied = true; c.el.classList.add('occupied');
  }
  renderPlaced(px,py,piece);
  filled += piece.coords.length;
  moves += 1;
  updateHUD();
  checkWin();
}

function checkWin(){
  if(filled >= CELL_COUNT){
    rewardSlot.innerHTML = '';
    const img = document.createElement('img');
    img.alt = 'Reward'; img.style.width = '90%'; img.style.height='90%'; img.style.objectFit='contain';
    img.src = ASSETS.reward || '';
    rewardSlot.appendChild(img);
    confirmModal('Fishing Jigsaw', 'You filled the entire board—nice!');
  }
}

// ======= Mouse handling =======
boardEl.addEventListener('mousemove', (e)=>{
  if(!holding) return;

  const rect = boardEl.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / (rect.width / COLS));
  const y = Math.floor((e.clientY - rect.top)  / (rect.height / ROWS));
  holding.x = Math.max(0, Math.min(COLS-1, x));
  holding.y = Math.max(0, Math.min(ROWS-1, y));

  const r = rectForFootprint(holding.x, holding.y, holding.piece.w, holding.piece.h);
  ghostEl.style.left   = r.left  + 'px';
  ghostEl.style.top    = r.top   + 'px';
  ghostEl.style.width  = r.width + 'px';
  ghostEl.style.height = r.height+ 'px';

  ghostEl.classList.toggle('invalid', !canPlaceAt(holding.x, holding.y, holding.piece));
});

boardEl.addEventListener('mouseleave', ()=>{ if(holding) ghostEl.classList.add('hidden'); });
boardEl.addEventListener('mouseenter', ()=>{ if(holding) ghostEl.classList.remove('hidden'); });

boardEl.addEventListener('click', async ()=>{
  if(!holding) return;
  const ok = await confirmModal('Do you want to add this?', 'Place this piece here?');
  if(!ok) return;
  if(canPlaceAt(holding.x, holding.y, holding.piece)){
    placeAt(holding.x, holding.y, holding.piece);
    stopHolding();
  } else {
    confirmModal('Invalid placement', 'That piece does not fit there.');
  }
});

// Right click to attempt drop
window.addEventListener('contextmenu', (e)=>{
  if(holding){ e.preventDefault(); onDropAttempt(); }
});
async function onDropAttempt(){
  const ok = await confirmModal('Do you want to drop this?', 'Discard the current piece?');
  if (ok) {
    moves += 1;       // count as a move
    updateHUD();
    stopHolding();
  }
}

// Chest + reset
chestBtn.addEventListener('click', onChestClick);
resetBtn.addEventListener('click', ()=>{
  buildBoard();
  stopHolding();
  moves = 0; filled = 0; updateHUD();
  rewardSlot.innerHTML = '<span class="reward-placeholder">Reward</span>';
});

// ======= Init =======
buildBoard();
updateHUD();
