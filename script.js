// Fishing Jigsaw — full game logic + metrics + timer controls
// - Chest spawns real pieces (with sprites)
// - Accurate ghost snap & shaped sheath
// - Avg moves/board, Avg time/board
// - Milestones @ 50/100/200 (session snapshot + last board)
// - Timer: start on first accepted chest, Stop (pause), Reset (clear to 00:00)

////////////////////
// Config & assets
////////////////////
const COLS = 6, ROWS = 4;
const CELL_COUNT = COLS * ROWS;
const ASSETS = {
  chest: 'assets/chest.png',
  reward: 'assets/reward.png',
};

// Pieces (fixed orientation, tweak paths to your repo layout)
const PIECES = [
  { id: 'O1',    name: '1x1',        w:1, h:1, sprite:'assets/pieces/orange_1x1.png', coords:[[0,0]] },
  { id: 'LINE3', name: '3x1 line',   w:1, h:3, sprite:'assets/pieces/blue_3x1.png',   coords:[[0,0],[0,1],[0,2]] },
  { id: 'S',     name: 'S shape',    w:3, h:2, sprite:'assets/pieces/red_s.png',      coords:[[0,0],[1,0],[1,1],[2,1]] },
  { id: 'SQ2',   name: '2x2 square', w:2, h:2, sprite:'assets/pieces/cyan_2x2.png',   coords:[[0,0],[1,0],[0,1],[1,1]] },
  { id: 'J',     name: 'J shape',    w:2, h:2, sprite:'assets/pieces/yellow_j.png',   coords:[[0,0],[1,0],[1,1]] },
  { id: 'L',     name: 'L shape',    w:2, h:2, sprite:'assets/pieces/green_l.png',    coords:[[0,0],[0,1],[1,1]] },
];

////////////////////
// Elements
////////////////////
const boardEl        = document.getElementById('board');
const ghostEl        = document.getElementById('ghost');
const sheathEl       = document.getElementById('sheath');
const chestBtn       = document.getElementById('chestBtn');
const rewardSlot     = document.getElementById('rewardSlot');
const moveCountEl    = document.getElementById('moveCount');
const filledCountEl  = document.getElementById('filledCount');
const resetBtn       = document.getElementById('resetBtn');

const timerEl        = document.getElementById('timer');
const boardsCountEl  = document.getElementById('boardsCount');
const avgMovesEl     = document.getElementById('avgMoves');
const avgTimeEl      = document.getElementById('avgTime');
const milestoneListEl= document.getElementById('milestoneList');

// Optional (defensive) — only wired if present in HTML
const stopTimerBtn   = document.getElementById('stopTimerBtn');
const resetTimerBtn  = document.getElementById('resetTimerBtn');

// Modal
const modalEl        = document.getElementById('modal');
const modalTitleEl   = document.getElementById('modalTitle');
const modalMsgEl     = document.getElementById('modalMsg');
const modalYesBtn    = document.getElementById('modalYes');
const modalNoBtn     = document.getElementById('modalNo');

////////////////////
// State
////////////////////
let cells = [];                  // [{el, occupied}]
let holding = null;              // { piece, x, y }
let moves = 0;                   // current board moves (successful placements + discards)
let filled = 0;                  // current board filled cells

// Session stats
let boardsSolved = 0;
let totalMovesAllBoards = 0;     // sum of moves across finished boards
let totalBoardTimeMs = 0;        // sum of durations across finished boards

// Session timer (UI timer)
let startTime = null;            // when session timer started
let timerInterval = null;
let timerRunning = false;

// Per-board timer
let boardStartTime = null;

// Pointer tracking (for correct initial ghost placement)
let lastPointer = { x: window.innerWidth/2, y: window.innerHeight/2 };

// Milestones
const MILESTONES = [50, 100, 200];
const achievedMilestones = new Set();

////////////////////
// Utilities
////////////////////
function idx(x,y){ return y*COLS + x; }
function inBounds(x,y){ return x>=0 && x<COLS && y>=0 && y<ROWS; }
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

function getGridGaps() {
  const cs = getComputedStyle(boardEl);
  const colGap = parseFloat(cs.columnGap || cs.gap || '0') || 0;
  const rowGap = parseFloat(cs.rowGap    || cs.gap || '0') || 0;
  return { colGap, rowGap };
}

function formatDuration(ms){
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

////////////////////
// Timer controls
////////////////////
function updateTimer(){
  if(!startTime){ timerEl && (timerEl.textContent = '00:00'); return; }
  timerEl && (timerEl.textContent = formatDuration(Date.now() - startTime));
}
function startTimerIfNeeded(){
  if (startTime !== null || timerRunning) return;  // already started or running
  startTime = Date.now();
  timerRunning = true;
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}
function stopTimer(){
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  // keep startTime so we can resume later if you want, but we don’t auto-resume anywhere
}
function resetTimer(){
  stopTimer();
  startTime = null;
  timerEl && (timerEl.textContent = '00:00');
}

////////////////////
// HUD updates
////////////////////
function updateHUD(){
  moveCountEl && (moveCountEl.textContent = String(moves));
  filledCountEl && (filledCountEl.textContent = String(filled));
}
function updateStatsHUD(){
  boardsCountEl && (boardsCountEl.textContent = String(boardsSolved));
  const avgMoves = boardsSolved ? (totalMovesAllBoards / boardsSolved) : 0;
  avgMovesEl && (avgMovesEl.textContent = avgMoves.toFixed(2));
  const avgTimeMs = boardsSolved ? (totalBoardTimeMs / boardsSolved) : 0;
  avgTimeEl && (avgTimeEl.textContent = formatDuration(avgTimeMs));
}

////////////////////
// Modals
////////////////////
function confirmModal(title, msg){
  modalTitleEl.textContent = title;
  modalMsgEl.textContent = msg;

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

////////////////////
// Board lifecycle
////////////////////
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
  // start per-board timer
  boardStartTime = Date.now();
}

function doReset(){
  buildBoard();
  stopHolding();
  moves = 0;
  filled = 0;
  updateHUD();
  updateStatsHUD();
  rewardSlot && (rewardSlot.innerHTML = '<span class="reward-placeholder">Reward</span>');
}

////////////////////
// Placement logic
////////////////////
function canPlaceAt(px,py,piece){
  for(const [dx,dy] of piece.coords){
    const x = px + dx, y = py + dy;
    if(!inBounds(x,y)) return false;
    if(cells[idx(x,y)].occupied) return false;
  }
  return true;
}

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
  moves += 1;                           // successful placement is a move
  updateHUD();
  checkWin();
}

async function checkWin(){
  if(filled < CELL_COUNT) return;

  // show reward
  if (rewardSlot){
    rewardSlot.innerHTML = '';
    const img = document.createElement('img');
    img.alt = 'Reward';
    img.style.width = '90%';
    img.style.height='90%';
    img.style.objectFit='contain';
    img.src = ASSETS.reward || '';
    rewardSlot.appendChild(img);
  }

  // session stats update (BEFORE reset)
  boardsSolved += 1;
  totalMovesAllBoards += moves;

  const boardMs = boardStartTime ? (Date.now() - boardStartTime) : 0;
  totalBoardTimeMs += boardMs;
  updateStatsHUD();
  checkMilestones(boardMs);

  await winModal('You filled the entire board — nice!');
  doReset();
}

////////////////////
// Ghost + sheath
////////////////////
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

  // rebuild shaped sheath
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

  // validity coloring
  if (canPlaceAt(holding.x, holding.y, piece)) {
    sheathEl.classList.remove('invalid');
  } else {
    sheathEl.classList.add('invalid');
  }
}

////////////////////
// Holding flow
////////////////////
function randomPiece(){ return PIECES[Math.floor(Math.random()*PIECES.length)]; }

function startHolding(piece){
  holding = { piece, x:0, y:0 };

  // size ghost to exact footprint using real cell size + gaps
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

  // immediately position ghost at current pointer
  ghostEl.style.left = (lastPointer.x - cellW / 2) + 'px';
  ghostEl.style.top  = (lastPointer.y - cellH / 2) + 'px';

  // compute snap/sheath if cursor over the board
  const rect = boardEl.getBoundingClientRect();
  const overBoard =
    lastPointer.x >= rect.left && lastPointer.x <= rect.right &&
    lastPointer.y >= rect.top  && lastPointer.y <= rect.bottom;

  if (overBoard) {
    const mouseX = lastPointer.x - rect.left;
    const mouseY = lastPointer.y - rect.top;
    show(sheathEl);
    updateSheath(mouseX, mouseY);
  } else {
    hide(sheathEl);
  }
}

function stopHolding(){
  holding = null;
  hide(ghostEl);
  hide(sheathEl);
  sheathEl.innerHTML = '';
  ghostEl.classList.remove('free');
}

////////////////////
// Chest + actions
////////////////////
async function onChestClick(){
  if(holding) return; // already carrying something
  const ok = await confirmModal('Do you want to use this?', 'Open the chest to draw a random piece?');
  if(!ok) return;

  // Start session timer only once, unless you Reset (then it can start again)
  startTimerIfNeeded();

  const piece = randomPiece();
  startHolding(piece);
}

// place on board click (with confirm)
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

// discard with right-click (counts as a move, not a placement)
window.addEventListener('contextmenu', (e)=>{
  if(holding){ e.preventDefault(); onDropAttempt(); }
});
async function onDropAttempt(){
  const ok = await confirmModal('Do you want to drop this?', 'Discard the current piece?');
  if (ok) {
    moves += 1; // still a move
    updateHUD();
    stopHolding();
  }
}

////////////////////
// Mouse tracking
////////////////////
boardEl.addEventListener('mousemove', (e) => {
  if (!holding) return;

  const rect = boardEl.getBoundingClientRect();

  const clientX = e.clientX;
  const clientY = e.clientY;

  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const firstCell = cells[0].el;
  const cellW = firstCell.offsetWidth;
  const cellH = firstCell.offsetHeight;

  ghostEl.style.left = (clientX - cellW / 2) + 'px';
  ghostEl.style.top  = (clientY - cellH / 2) + 'px';

  updateSheath(mouseX, mouseY);
});

boardEl.addEventListener('mouseleave', ()=>{ if(holding) hide(sheathEl); });
boardEl.addEventListener('mouseenter', ()=>{ if(holding) show(sheathEl); });

// track pointer globally so newly spawned ghost appears right where the pointer is
function getPoint(e){
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}
document.addEventListener('pointermove', (e) => {
  const pt = getPoint(e);
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
  lastPointer = pt;
  if (!holding) return;
  const firstCell = cells[0].el;
  const cellW = firstCell.offsetWidth;
  const cellH = firstCell.offsetHeight;
  ghostEl.style.left = (pt.x - cellW/2) + 'px';
  ghostEl.style.top  = (pt.y - cellH/2) + 'px';
}, { passive: false });

////////////////////
// Milestones
////////////////////
function checkMilestones(lastBoardMs){
  if (!MILESTONES.includes(boardsSolved) || achievedMilestones.has(boardsSolved)) return;

  achievedMilestones.add(boardsSolved);
  const avgMoves = boardsSolved ? (totalMovesAllBoards / boardsSolved) : 0;
  const avgTimeMs = boardsSolved ? (totalBoardTimeMs / boardsSolved) : 0;

  if (!milestoneListEl) return; // optional UI
  const li = document.createElement('li');
  li.className = 'milestone-item';
  const sessionElapsed = startTime ? (Date.now() - startTime) : 0;

  li.innerHTML = `
    <div class="milestone-row"><strong>${boardsSolved} boards</strong></div>
    <div class="milestone-row">
      Session: <em>${formatDuration(sessionElapsed)}</em> |
      Avg moves/board: <em>${avgMoves.toFixed(2)}</em> |
      Avg time/board: <em>${formatDuration(avgTimeMs)}</em>
    </div>
    <div class="milestone-row small">
      Last board — moves: <em>${moves}</em>, time: <em>${formatDuration(lastBoardMs)}</em>
    </div>
  `;
  milestoneListEl.appendChild(li);
}

////////////////////
// Wire controls
////////////////////
chestBtn.addEventListener('click', onChestClick);
resetBtn && resetBtn.addEventListener('click', doReset);
stopTimerBtn && stopTimerBtn.addEventListener('click', stopTimer);
resetTimerBtn && resetTimerBtn.addEventListener('click', resetTimer);

////////////////////
// Init
////////////////////
buildBoard();
moves = 0;
filled = 0;
updateHUD();
updateStatsHUD();
updateTimer();
