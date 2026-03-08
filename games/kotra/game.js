'use strict';

// ─────────────────────────────────────────────
// Constants & State
// ─────────────────────────────────────────────

const WHITE = 'white';
const BLACK = 'black';
const BAR   = 'bar';
const OFF   = 'off';

let state = {
  board: [],          // index 1-24, each { color: null|WHITE|BLACK, count: 0 }
  bar: { white: 0, black: 0 },
  off: { white: 0, black: 0 },
  currentPlayer: WHITE,
  dice: [],           // remaining die values for this turn
  allDice: [],        // full roll (for display)
  usedDice: [],       // which dice indices have been consumed
  phase: 'start',    // 'start' | 'rolling' | 'moving' | 'ai' | 'over'
  selectedPoint: null,
  legalMoves: [],
};

// ─────────────────────────────────────────────
// Board initialisation
// ─────────────────────────────────────────────

function initBoard() {
  state.board = new Array(25).fill(null).map(() => ({ color: null, count: 0 }));
  state.bar  = { white: 0, black: 0 };
  state.off  = { white: 0, black: 0 };

  // Standard starting position
  // White moves 24 → 1 (home: 1-6), Black moves 1 → 24 (home: 19-24)
  place(24, WHITE, 2);
  place(13, WHITE, 5);
  place(8,  WHITE, 3);
  place(6,  WHITE, 5);

  place(1,  BLACK, 2);
  place(12, BLACK, 5);
  place(17, BLACK, 3);
  place(19, BLACK, 5);
}

function place(pt, color, count) {
  state.board[pt].color = color;
  state.board[pt].count = count;
}

function newGame() {
  initBoard();
  state.currentPlayer = WHITE;
  state.dice       = [];
  state.allDice    = [];
  state.usedDice   = [];
  state.phase      = 'rolling';
  state.selectedPoint = null;
  state.legalMoves = [];

  document.getElementById('overlay').classList.add('hidden');
  setStatus('Rolling…');
  enableRoll(false);
  render();
  setTimeout(onRoll, 600);
}

// ─────────────────────────────────────────────
// Dice
// ─────────────────────────────────────────────

function rollDiceValues() {
  const d1 = Math.ceil(Math.random() * 6);
  const d2 = Math.ceil(Math.random() * 6);
  // allDice always stores the 2 physical dice; dice has 4 entries for doubles
  const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  return { faces: [d1, d2], moves };
}

// ─────────────────────────────────────────────
// Move validation
// ─────────────────────────────────────────────

function direction(player) { return player === WHITE ? -1 : 1; }
function homeRange(player) { return player === WHITE ? [1,6] : [19,24]; }

function allCheckersInHome(player) {
  const [lo, hi] = homeRange(player);
  let total = 0;
  for (let p = 1; p <= 24; p++) {
    if (p >= lo && p <= hi) continue;
    if (state.board[p].color === player) total += state.board[p].count;
  }
  total += state.bar[player];
  return total === 0;
}

// Returns array of {from, to, dieIdx} legal moves for `player` given `availDice`
function getLegalMoves(player, availDice) {
  const moves = [];
  const uniqueDice = [...new Set(availDice)];

  function tryMove(from, to, dieIdx) {
    if (to < 1 || to > 24) {
      // Bear-off attempt
      if (!allCheckersInHome(player)) return;
      // to === 0 (white) or 25 (black): exact or highest die used when no exact
      const dest = player === WHITE ? 0 : 25;
      // Check if exact or if no checker further back
      if (to === dest) {
        moves.push({ from, to: dest, dieIdx });
      } else {
        // Over-bear: only legal if no checker on higher-numbered point
        // (for white: no checker on point > from; for black: no checker on point < from)
        let canOverbear = true;
        if (player === WHITE) {
          for (let p = from + 1; p <= 6; p++) {
            if (state.board[p].color === WHITE && state.board[p].count > 0) { canOverbear = false; break; }
          }
        } else {
          for (let p = from - 1; p >= 19; p--) {
            if (state.board[p].color === BLACK && state.board[p].count > 0) { canOverbear = false; break; }
          }
        }
        if (canOverbear) moves.push({ from, to: dest, dieIdx });
      }
      return;
    }
    const dest = state.board[to];
    if (dest.color !== null && dest.color !== player && dest.count > 1) return; // blocked
    moves.push({ from, to, dieIdx });
  }

  if (state.bar[player] > 0) {
    // Must re-enter from bar
    uniqueDice.forEach((dv, di) => {
      const actualDi = availDice.indexOf(dv);
      const to = player === WHITE ? 25 - dv : dv;
      const dest = state.board[to];
      if (!dest.color || dest.color === player || dest.count <= 1) {
        moves.push({ from: BAR, to, dieIdx: actualDi });
      }
    });
  } else {
    for (let from = 1; from <= 24; from++) {
      if (!state.board[from].color || state.board[from].color !== player) continue;
      uniqueDice.forEach((dv) => {
        const di = availDice.indexOf(dv);
        const to = from + dv * direction(player);
        tryMove(from, to, di);
      });
    }
  }

  // Deduplicate (same from/to, different dieIdx — keep one)
  const seen = new Set();
  return moves.filter(m => {
    const key = `${m.from}-${m.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyMove(move) {
  const { from, to } = move;
  const player  = state.currentPlayer;
  const opponent = player === WHITE ? BLACK : WHITE;

  // Remove from source
  if (from === BAR) {
    state.bar[player]--;
  } else {
    state.board[from].count--;
    if (state.board[from].count === 0) state.board[from].color = null;
  }

  // Bear off
  if (to === 0 || to === 25) {
    state.off[player]++;
    return;
  }

  // Hit blot
  if (state.board[to].color === opponent && state.board[to].count === 1) {
    state.board[to].count = 0;
    state.board[to].color = null;
    state.bar[opponent]++;
  }

  // Place checker
  state.board[to].color = player;
  state.board[to].count++;
}

// Find die index for a move (first match)
function findDieIndex(move, availDice) {
  if (move.dieIdx !== undefined) return move.dieIdx;
  // Re-derive
  const dv = move.from === BAR
    ? (state.currentPlayer === WHITE ? 25 - move.to : move.to)
    : Math.abs(move.to - move.from);
  return availDice.indexOf(dv);
}

function consumeDie(dieIdx) {
  state.dice.splice(dieIdx, 1);
  // track for display
  let count = 0;
  const originalDv = state.allDice[dieIdx < state.allDice.length ? dieIdx : state.allDice.length - 1];
  state.usedDice.push(dieIdx);
}

// ─────────────────────────────────────────────
// Game over
// ─────────────────────────────────────────────

function checkWinner() {
  if (state.off.white === 15) return WHITE;
  if (state.off.black === 15) return BLACK;
  return null;
}

function endGame(winner) {
  state.phase = 'over';
  const title = winner === WHITE ? 'You Win!' : 'AI Wins!';
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay').classList.remove('hidden');
}

// ─────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────

function scoreMove(move, boardSnapshot) {
  let score = 0;
  const { from, to } = move;
  const opponent = WHITE;

  // Entering from bar is highest priority
  if (from === BAR) score += 50;

  // Hit opponent blot
  if (to !== 0 && to !== 25 && boardSnapshot[to] &&
      boardSnapshot[to].color === opponent && boardSnapshot[to].count === 1) {
    score += 20;
  }

  // Making a point (already have one there)
  if (to !== 0 && to !== 25 && boardSnapshot[to] &&
      boardSnapshot[to].color === BLACK && boardSnapshot[to].count >= 1) {
    score += 15;
  }

  // Prefer advancing (moving toward bear-off)
  if (from !== BAR && to !== 0 && to !== 25) {
    score += (to - 12) * 0.5; // higher points are closer to bear-off for black
  }

  // Avoid leaving a blot (moving away from isolated checker)
  if (from !== BAR && boardSnapshot[from] && boardSnapshot[from].count === 1) {
    score += 5; // freeing a lone checker can be good
  }

  return score;
}

function runAI() {
  let availDice = [...state.dice];
  let iterations = 0;

  while (availDice.length > 0 && iterations < 8) {
    iterations++;
    const moves = getLegalMoves(BLACK, availDice);
    if (moves.length === 0) break;

    // Score each move
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      const s = scoreMove(m, state.board);
      if (s > bestScore) { bestScore = s; best = m; }
    }

    // Find the die index in availDice
    const dv = best.from === BAR
      ? best.to  // for black, to === dv
      : Math.abs(best.to - best.from);
    const di = availDice.indexOf(dv);
    if (di !== -1) availDice.splice(di, 1);
    else availDice.shift();

    state.currentPlayer = BLACK;
    applyMove(best);

    const winner = checkWinner();
    if (winner) { endGame(winner); return; }
  }

  state.dice    = [];
  state.allDice = [];
  state.phase = 'rolling';
  state.currentPlayer = WHITE;
  setStatus('Rolling…');
  enableRoll(false);
  render();
  setTimeout(onRoll, 600);
}

// ─────────────────────────────────────────────
// Player turn flow
// ─────────────────────────────────────────────

function onRoll() {
  if (state.phase !== 'rolling') return;
  enableRoll(false);

  const rolled = rollDiceValues();
  state.allDice  = rolled.faces;
  state.dice     = [...rolled.moves];
  state.usedDice = [];

  renderDice();

  const lm = getLegalMoves(state.currentPlayer, state.dice);
  if (lm.length === 0) {
    setStatus('No legal moves — turn skipped!');
    setTimeout(endPlayerTurn, 1200);
    return;
  }

  state.phase = 'moving';
  setStatus('Select a checker to move');
  render();
}

function endPlayerTurn() {
  state.dice = [];
  state.selectedPoint = null;
  state.legalMoves = [];
  state.phase = 'ai';
  setStatus('AI is thinking…');
  render();

  const rolled = rollDiceValues();
  state.allDice = rolled.faces;
  state.dice    = [...rolled.moves];
  state.currentPlayer = BLACK;
  renderDice();

  setTimeout(runAI, 900);
}

function onPointClick(pt) {
  if (state.phase !== 'moving' || state.currentPlayer !== WHITE) return;

  // Clicking a highlighted destination
  if (state.selectedPoint !== null) {
    const move = state.legalMoves.find(m => m.to === pt || (pt === 'off' && (m.to === 0)));
    if (move) {
      executeMoveAndContinue(move);
      return;
    }
  }

  // Clicking own checker or bar
  const isBar  = pt === BAR;
  const onBar  = state.bar.white > 0;

  if (onBar && !isBar) {
    setStatus('You must re-enter your checker from the bar first!');
    return;
  }

  const pointColor = isBar ? WHITE : (state.board[pt] || {}).color;
  if (pointColor !== WHITE) { clearSelection(); return; }

  // Compute legal moves from this point
  const fromMoves = state.legalMoves = getLegalMoves(WHITE, state.dice)
    .filter(m => m.from === pt || (pt === BAR && m.from === BAR));

  if (fromMoves.length === 0) { clearSelection(); return; }

  state.selectedPoint = pt;
  render();
}

function executeMoveAndContinue(move) {
  const di = findDieIndex(move, state.dice);
  if (di !== -1) state.dice.splice(di, 1);
  else state.dice.shift();

  applyMove(move);

  const winner = checkWinner();
  if (winner) { render(); endGame(winner); return; }

  state.selectedPoint = null;
  state.legalMoves = [];
  renderDice();

  if (state.dice.length === 0) {
    render();
    setTimeout(endPlayerTurn, 300);
    return;
  }

  const remaining = getLegalMoves(WHITE, state.dice);
  if (remaining.length === 0) {
    setStatus('No more legal moves — ending turn');
    render();
    setTimeout(endPlayerTurn, 1000);
    return;
  }

  state.legalMoves = remaining;
  setStatus(`Move another checker (${state.dice.join(', ')} left)`);
  render();
}

function clearSelection() {
  state.selectedPoint = null;
  state.legalMoves = getLegalMoves(WHITE, state.dice);
  render();
}

// ─────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────

function render() {
  renderBoard();
  renderBar();
  renderScores();
  renderDice();
}

function renderBoard() {
  const topLeft    = document.getElementById('top-left');
  const topRight   = document.getElementById('top-right');
  const bottomLeft = document.getElementById('bottom-left');
  const bottomRight= document.getElementById('bottom-right');
  const topLabels  = document.getElementById('top-labels');
  const botLabels  = document.getElementById('bottom-labels');

  topLeft.innerHTML = '';
  topRight.innerHTML = '';
  bottomLeft.innerHTML = '';
  bottomRight.innerHTML = '';
  topLabels.innerHTML = '';
  botLabels.innerHTML = '';

  // Determine highlighted destinations
  const destSet = new Set(state.legalMoves.map(m => m.to));

  // Top row: points 13-24 (left to right as seen by white = 13..18 left, 19..24 right)
  // Bottom row: points 12-1 (left to right as seen by white = 12..7 left, 6..1 right)

  // Build label rows
  // Top labels: 13..18 | spacer | 19..24
  const topNums = [13,14,15,16,17,18,19,20,21,22,23,24];
  const botNums = [12,11,10,9,8,7,6,5,4,3,2,1];

  function makeLabels(nums, container) {
    // Left half (first 6), spacer, right half (last 6)
    nums.slice(0,6).forEach(n => {
      const el = document.createElement('div');
      el.className = 'point-label';
      el.textContent = n;
      container.appendChild(el);
    });
    const sp = document.createElement('div');
    sp.className = 'label-spacer';
    container.appendChild(sp);
    nums.slice(6).forEach(n => {
      const el = document.createElement('div');
      el.className = 'point-label';
      el.textContent = n;
      container.appendChild(el);
    });
  }

  makeLabels(topNums, topLabels);
  makeLabels(botNums, botLabels);

  function makePoint(pt, isTop, colorClass) {
    const div = document.createElement('div');
    div.className = `point ${isTop ? 'top-point' : 'bottom-point'}`;
    div.dataset.pt = pt;

    const tri = document.createElement('div');
    tri.className = `triangle ${colorClass}`;
    div.appendChild(tri);

    const stack = document.createElement('div');
    stack.className = 'checkers-stack';
    div.appendChild(stack);

    const data = state.board[pt];
    const MAX_VISIBLE = 5;
    if (data && data.count > 0) {
      const visible = Math.min(data.count, MAX_VISIBLE);
      for (let i = 0; i < visible; i++) {
        if (i === MAX_VISIBLE - 1 && data.count > MAX_VISIBLE) {
          const badge = document.createElement('div');
          badge.className = `count-badge ${data.color}`;
          badge.textContent = data.count;
          stack.appendChild(badge);
        } else {
          const ch = document.createElement('div');
          ch.className = `checker ${data.color}`;
          stack.appendChild(ch);
        }
      }
    }

    // Highlight & selection
    if (state.phase === 'moving' && state.currentPlayer === WHITE) {
      if (destSet.has(pt)) div.classList.add('highlight');
      if (state.selectedPoint === pt) div.classList.add('selected');
    }

    div.addEventListener('click', () => {
      if (destSet.has(pt) && state.selectedPoint !== null) {
        const move = state.legalMoves.find(m => m.to === pt);
        if (move) { executeMoveAndContinue(move); return; }
      }
      onPointClick(pt);
    });

    return div;
  }

  // Top left: points 13-18
  [13,14,15,16,17,18].forEach((pt, i) => {
    topLeft.appendChild(makePoint(pt, true, i % 2 === 0 ? 'dark' : 'light'));
  });

  // Top right: points 19-24
  [19,20,21,22,23,24].forEach((pt, i) => {
    topRight.appendChild(makePoint(pt, true, i % 2 === 0 ? 'dark' : 'light'));
  });

  // Bottom left: points 12-7
  [12,11,10,9,8,7].forEach((pt, i) => {
    bottomLeft.appendChild(makePoint(pt, false, i % 2 === 0 ? 'dark' : 'light'));
  });

  // Bottom right: points 6-1
  [6,5,4,3,2,1].forEach((pt, i) => {
    bottomRight.appendChild(makePoint(pt, false, i % 2 === 0 ? 'dark' : 'light'));
  });

  // Bear-off click areas (clicking off-board)
  // (handled by bar area — no UI needed; move auto-applied when to===0/25)
}

function renderBar() {
  const barTop = document.getElementById('bar-top');
  const barBot = document.getElementById('bar-bottom');
  barTop.innerHTML = '';
  barBot.innerHTML = '';

  const destSet = new Set(state.legalMoves.map(m => m.to));
  const barLegalDests = state.legalMoves.filter(m => m.from === BAR).map(m => m.to);

  // Black bar at top, white bar at bottom (conventional)
  if (state.bar.black > 0) {
    const el = document.createElement('div');
    el.className = 'bar-checker black';
    el.textContent = state.bar.black > 1 ? state.bar.black : '';
    barTop.appendChild(el);
  }

  if (state.bar.white > 0) {
    const el = document.createElement('div');
    el.className = `bar-checker white${state.selectedPoint === BAR ? ' highlight' : ''}`;
    el.textContent = state.bar.white > 1 ? state.bar.white : '';
    el.addEventListener('click', () => onPointClick(BAR));
    barBot.appendChild(el);
  }

  // If white has checkers on bar that are highlighted destinations... (re-entry)
  // Highlight is shown on the point destinations, not the bar itself
}

function renderScores() {
  document.getElementById('white-off').textContent = `${state.off.white} / 15`;
  document.getElementById('black-off').textContent = `${state.off.black} / 15`;
  document.getElementById('white-bar').textContent = state.bar.white;
  document.getElementById('black-bar').textContent = state.bar.black;
}

function renderDice() {
  const display = document.getElementById('dice-display');
  display.classList.toggle('turn-white', state.currentPlayer === WHITE);
  display.classList.toggle('turn-black', state.currentPlayer === BLACK);

  const pipPositions = ['tl','tc','tr','ml','c','mr','bl','bc','br'];
  const patterns = {
    1: ['c'],
    2: ['tr','bl'],
    3: ['tr','c','bl'],
    4: ['tl','tr','bl','br'],
    5: ['tl','tr','c','bl','br'],
    6: ['tl','tr','ml','mr','bl','br'],
  };

  const isDoubles = state.allDice.length === 2 && state.allDice[0] === state.allDice[1];
  const movesLeft = state.dice.length; // remaining moves (1-4 for doubles, 0-2 otherwise)

  // How many of the 2 physical dice are "used up"
  // For doubles: each physical die represents 2 moves; mark used when both its moves gone
  // For normal: directly map remaining dice to physical
  function isDieUsed(dieIndex) {
    if (!isDoubles) {
      // Normal: 2 dice. Used count = 2 - remaining
      return dieIndex < (2 - state.dice.length);
    } else {
      // Doubles: die0 covers moves 3-4, die1 covers moves 1-2
      if (dieIndex === 0) return movesLeft <= 2; // first die used after 2 moves
      if (dieIndex === 1) return movesLeft === 0; // second die used after all 4
    }
  }

  ['die1','die2'].forEach((id, i) => {
    const el = document.getElementById(id);
    const val = state.allDice[i] || state.allDice[0];
    el.dataset.val = val;

    // Render pips
    el.innerHTML = '';
    pipPositions.forEach(pos => {
      const pip = document.createElement('div');
      pip.className = `pip ${pos}`;
      pip.style.visibility = (patterns[val] || []).includes(pos) ? 'visible' : 'hidden';
      el.appendChild(pip);
    });

    el.classList.toggle('used', state.allDice.length > 0 && isDieUsed(i));

    // Doubles badge: show remaining moves on die1 only
    const existingBadge = el.parentElement.querySelector('.doubles-badge');
    if (existingBadge) existingBadge.remove();

    if (isDoubles && i === 0 && movesLeft > 0) {
      // Wrap die in a relative container if not already
      let wrap = el.parentElement;
      if (!wrap.classList.contains('die-wrap')) {
        wrap = document.createElement('div');
        wrap.className = 'die-wrap';
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
      }
      const badge = document.createElement('div');
      badge.className = 'doubles-badge';
      badge.textContent = `×${movesLeft}`;
      wrap.appendChild(badge);
    }
  });
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

function enableRoll(_on) {
  // Roll Dice button removed — dice auto-roll
}

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initBoard();
  state.phase = 'rolling';
  render();
  setStatus('Rolling…');
  setTimeout(onRoll, 600);

  document.getElementById('btn-new').addEventListener('click', newGame);
  document.getElementById('overlay-new').addEventListener('click', newGame);
});
