// Fishing Jigsaw — top-left cell–center anchoring, shaped sheath, win OK resets
// UPDATE: instant-accurate ghost on spawn via global pointer tracking + startHolding() snap

// ======= Config =======
const COLS = 6, ROWS = 4;
const CELL_COUNT = COLS * ROWS;
const ASSETS = {
  chest: 'assets/chest.png',
  reward: 'assets/reward.png',
};

// Pieces (fixed orientation).
const PIECES = [
  { id: 'O1',   name: '1x1',        w:1, h:1, sprite:'assets/pieces/orange_1x1.png', coords:[[0,0]] },
  { id: 'LINE3',name: '3x1 line',   w:1, h:3, sprite:'assets/pieces/blue_3x1.png',   coords:[[0,0],[0,1],[0,2]] },
  { id: 'S',    name: 'S shape',    w:3, h:2, sprite:'assets/pieces/red_s.png',      coords:[[0,0],[1,0],[1,1],[2,1]] },
  { id: 'SQ2',  name: '2x2 square', w:2, h:2, sprite:'assets/pieces/cyan_2x2.png',   coords:[[0,0],[1,0],[0,1],[1,1]] },
  { id: 'J',    name: 'J shape',    w:2, h:2, sprite:'assets/pieces/yellow_j.png',    coords:[[0,0],[1,0],[1,1]] }, // mirror of L
  { id: 'L',    name: 'L shape',    w:2, h:2, sprite:'assets/pieces/green_l.png',    coords:[[0,0],[0,1],[1,1]] },
];

// ======= Elements / State =======
const boardEl = document.getElementById('board');
const ghostEl = document.getElementById('ghost');
const sheathEl = document.getElementById('sheath');
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

// NEW: track last pointer globally so we can snap instantly on spawn
let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

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
  // Standard Yes/No modal (Yes left, No right)
  modalTitleEl.textContent = title;
  modalMsgEl.textContent = msg;

  // ensure standard buttons visible & text restored
  modalNoBtn.style.display = '';
  modalYesBtn.textContent = 'Yes';
  modalYesBtn.style.margin = '';

  show(modalEl);
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

function winModal(message){
  // Special single-button "OK" modal centered
  modalTitleEl.textContent = 'Congratulations!';
  modalMsgEl.textContent = message || 'You filled the entire board — nice!';

  modalNoBtn.style.display = 'none';
  modalYesBtn.textContent = 'OK';
  modalYesBtn.style.margin = '0 auto';

  show(modalEl);
  return new Promise(resolve => {
    const onYes = () => {
      cleanup();
      resolve(true);
    };
    function cleanup(){
      hide(modalEl);
      modalYesBtn.removeEventListener('click', onYes);
      // restore defaults
      modalNoBtn.style.display = '';
      modalYesBtn.textContent = 'Yes';
      modalYesBtn.style.margin = '';
    }
    modalYesBtn.addEventListener('click', onYes);
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

function doReset(){
  buildBoard();
  stopHolding();
  moves = 0; 
  filled = 0; 
  updateHUD();
  rewardSlot.innerHTML = '<span class="reward-placeholder">Reward</span>';
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

  // Size ghost to exact footprint using real cell size + gaps
  const firstCell = cells[0].el;
  const cellW = firstCell.offsetWidth;
  const cellH = firstCell.offsetHeight;
  const { colGap, rowGap } = getGridGaps();

  ghostEl.style.backgroundImage = `url(${piece.sprite})`;
  ghostEl.style.width  = (cellW * piece.w + colGap * (piece.w - 1)) + 'px';
  ghostEl.style.height = (cellH * piece.h + rowGap * (piece.h - 1)) + 'px';

  show(ghostEl);
  show(sheathEl);
  ghostEl.classList.add('free'); // allow moving anywhere

  // NEW: immediately position ghost at the current pointer, no movement required
  ghostEl.style.left = (lastPointer.x - cellW / 2) + 'px';
  ghostEl.style.top  = (lastPointer.y - cellH / 2) + 'px';

  // NEW: instantly compute snap/sheath if cursor is over the board
  const rect = boardEl.getBoundingClientRect();
  const overBoard =
    lastPointer.x >= rect.left && lastPointer.x <= rect.right &&
    lastPointer.y >= rect.top  && lastPointer.y <= rect.bottom;

  if (overBoard) {
    // board-local coords for snapping
    const mouseX = lastPointer.x - rect.left;
    const mouseY = lastPointer.y - rect.top;
    show(sheathEl);
    updateSheath(mouseX, mouseY);
  } else {
    // cursor is outside board — hide sheath till it enters
    hide(sheathEl);
  }
}

function stopHolding(){
  holding = null;
  hide(ghostEl);
  hide(sheathEl);
  sheathEl.innerHTML = '';
  ghostEl.classList.remove('free'); // reset
}

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

async function checkWin(){
  if(filled >= CELL_COUNT){
    rewardSlot.innerHTML = '';
    const img = document.createElement('img');
    img.alt = 'Reward'; 
    img.style.width = '90%'; 
    img.style.height='90%'; 
    img.style.objectFit='contain';
    img.src = ASSETS.reward || '';
    rewardSlot.appendChild(img);

    // Show single-button win popup; after OK, reset board
    await winModal('You filled the entire board — nice!');
    doReset();
  }
}

// ======= Mouse handling =======
boardEl.addEventListener('mousemove', (e) => {
  if (!holding) return;

  const rect = boardEl.getBoundingClientRect();

  // Viewport coords for ghost (position:fixed)
  const clientX = e.clientX;
  const clientY = e.clientY;

  // Board-local coords for snapping
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const firstCell = cells[0].el;
  const cellW = firstCell.offsetWidth;
  const cellH = firstCell.offsetHeight;

  ghostEl.style.left = (clientX - cellW / 2) + 'px';
  ghostEl.style.top  = (clientY - cellH / 2) + 'px';

  updateSheath(mouseX, mouseY);
});

function updateSheath(mouseX, mouseY){
  if(!holding) return;
  const piece = holding.piece;

  const firstCell = cells[0]?.el;
  const cellW = firstCell.offsetWidth;
  const cellH = firstCell.offsetHeight;
  const { colGap, rowGap } = getGridGaps();

  const x = Math.floor(mouseX / (cellW + colGap));
  const y = Math.floor(mouseY / (cellH + rowGap));

  holding.x = Math.max(0, Math.min(COLS-1, x));
  holding.y = Math.max(0, Math.min(ROWS-1, y));

  // Rebuild shaped sheath blocks
  sheathEl.innerHTML = '';
  for (const [dx, dy] of piece.coords) {
    const px = holding.x + dx;
    const py = holding.y + dy;
    if (!inBounds(px, py)) continue;

    const anchor = cells[idx(px,py)].el;
    const left   = anchor.offsetLeft;
    const top    = anchor.offsetTop;
    const width  = anchor.offsetWidth;
    const height = anchor.offsetHeight;

    const block = document.createElement('div');
    block.className = 'sheath-cell';
    block.style.left = left + 'px';
    block.style.top = top + 'px';
    block.style.width = width + 'px';
    block.style.height = height + 'px';
    sheathEl.appendChild(block);
  }

  // Validity coloring
  if (canPlaceAt(holding.x, holding.y, piece)) {
    sheathEl.classList.remove('invalid');
  } else {
    sheathEl.classList.add('invalid');
  }
}

boardEl.addEventListener('mouseleave', ()=>{ if(holding) hide(sheathEl); });
boardEl.addEventListener('mouseenter', ()=>{ if(holding) show(sheathEl); });

// Place on click with confirmation
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

// --- Global move so ghost follows outside the board ---
function getPoint(e){
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

document.addEventListener('pointermove', (e) => {
  const pt = getPoint(e);
  // Always remember the last pointer location (even when not holding)
  lastPointer = pt;

  if (!holding) return;
  const firstCell = cells[0].el;
  const cellW = firstCell.offsetWidth;
  const cellH = firstCell.offsetHeight;
  ghostEl.style.left = (pt.x - cellW/2) + 'px';
  ghostEl.style.top  = (pt.y - cellH/2) + 'px';
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  const pt = getPoint(e);
  // Keep touch pointer in sync too
  lastPointer = pt;

  if (!holding) return;
  const firstCell = cells[0].el;
  const cellW = firstCell.offsetWidth;
  const cellH = firstCell.offsetHeight;
  ghostEl.style.left = (pt.x - cellW/2) + 'px';
  ghostEl.style.top  = (pt.y - cellH/2) + 'px';
}, { passive: false });

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
resetBtn.addEventListener('click', doReset);

// ======= Init =======
buildBoard();
updateHUD();
