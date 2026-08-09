// ---------------------------------------------------------------------------
// WINGO game rules (from the WINGO Rulebook, page 3-7)
// ---------------------------------------------------------------------------

// 5 symbols, one per column
export const SYMBOLS = [
  { key: 'bell', label: 'Bell', emoji: '🔔' },
  { key: 'cherry', label: 'Cherry', emoji: '🍒' },
  { key: 'star', label: 'BAR', emoji: '⭐' },
  { key: 'horseshoe', label: 'Horseshoe', emoji: '🧲' },
  { key: 'clover', label: 'Clover', emoji: '🍀' },
];

// Shown on the slot machine instead of a column symbol whenever a draw is
// wild - visually signals "place this number in any column" at a glance.
export const WILD_SYMBOL = { key: 'wild', label: 'Wild (Joker)', emoji: '🃏' };

// Looks up the symbol object to display for a drawn entry - the Joker for
// wild draws, otherwise the matching column symbol.
export function symbolForDraw(symbolKey) {
  if (symbolKey === WILD_SYMBOL.key) return WILD_SYMBOL;
  return SYMBOLS.find((s) => s.key === symbolKey) || null;
}

// The number and symbol on each draw are chosen completely independently
// (see app/api/draw/route.js) - there is no fixed numeric band per column.
// A number's column is determined ENTIRELY by which symbol it was drawn
// with on that particular draw, not by the number's value.
export function columnIndexForSymbol(symbolKey) {
  return SYMBOLS.findIndex((s) => s.key === symbolKey);
}

export const NUM_COLUMNS = 5;
export const ROWS_PER_BLOCK = 4;
export const NUM_BLOCKS = 3;
export const NUM_ROWS = ROWS_PER_BLOCK * NUM_BLOCKS; // 12 rows total

// ---------------------------------------------------------------------------
// Row roles — per the rulebook diagram (page 3/4), each of the 3 blocks has
// exactly ONE labeled bonus row (not every row):
//   Block 1 (rows 0-3):  row 0 = ODD/EVEN,  row 2 = ASCENDING
//   Block 2 (rows 4-7):  row 6 = ASCENDING
//   Block 3 (rows 8-11): row 9 = ASCENDING, row 11 = ODD/EVEN
// All other rows are plain (no bonus label, no constraint).
// ---------------------------------------------------------------------------
const ROW_ROLES = {
  0: 'ODD_EVEN',
  2: 'ASCENDING',
  6: 'ASCENDING',
  9: 'ASCENDING',
  11: 'ODD_EVEN',
};

export function rowRole(globalRowIndex) {
  return ROW_ROLES[globalRowIndex] || null;
}

export function blockOfRow(globalRowIndex) {
  return Math.floor(globalRowIndex / ROWS_PER_BLOCK);
}

// ---------------------------------------------------------------------------
// Ticket = 2D array [row][col] of { number, wild } | null
// ---------------------------------------------------------------------------

export function emptyTicket() {
  return Array.from({ length: NUM_ROWS }, () => Array(NUM_COLUMNS).fill(null));
}

// Can `number` be legally placed in `ticket` at column `col`, any empty row?
// Returns the list of valid row indices (empty cells that keep the column
// in ascending order), or [] if none.
export function validRowsForPlacement(ticket, col, number, isWild) {
  const valid = [];
  for (let row = 0; row < NUM_ROWS; row++) {
    if (ticket[row][col] !== null) continue; // occupied
    // check ascending constraint against existing numbers in this column
    let ok = true;
    for (let r = 0; r < NUM_ROWS; r++) {
      const cell = ticket[r][col];
      if (cell === null) continue;
      if (r < row && cell.number >= number) ok = false;
      if (r > row && cell.number <= number) ok = false;
    }
    if (ok) valid.push(row);
  }
  return valid;
}

// Wild numbers can go in ANY column (still respecting the ascending rule
// within whichever column they're placed in).
export function validPlacementsForWild(ticket, number) {
  const results = []; // { col, rows: [...] }
  for (let col = 0; col < NUM_COLUMNS; col++) {
    const rows = validRowsForPlacement(ticket, col, number, true);
    if (rows.length) results.push({ col, rows });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export const SCORE = {
  PER_NUMBER: 10,
  PER_COLUMN: 150,
  PER_BLOCK: 200,
  ODD_EVEN_ROW: 150,
  ASCENDING_ROW: 250,
};

export function calculateScore(ticket) {
  let score = 0;
  let placedCount = 0;
  const details = {
    numbers: 0,
    columns: 0,
    blocks: 0,
    oddEvenRows: 0,
    ascendingRows: 0,
  };

  // Numbers placed
  for (let r = 0; r < NUM_ROWS; r++) {
    for (let c = 0; c < NUM_COLUMNS; c++) {
      if (ticket[r][c] !== null) placedCount++;
    }
  }
  details.numbers = placedCount * SCORE.PER_NUMBER;
  score += details.numbers;

  // Complete columns
  for (let c = 0; c < NUM_COLUMNS; c++) {
    let full = true;
    for (let r = 0; r < NUM_ROWS; r++) {
      if (ticket[r][c] === null) full = false;
    }
    if (full) details.columns++;
  }
  score += details.columns * SCORE.PER_COLUMN;

  // Complete blocks (all cells in the block filled)
  for (let b = 0; b < NUM_BLOCKS; b++) {
    let full = true;
    for (let r = b * ROWS_PER_BLOCK; r < (b + 1) * ROWS_PER_BLOCK; r++) {
      for (let c = 0; c < NUM_COLUMNS; c++) {
        if (ticket[r][c] === null) full = false;
      }
    }
    if (full) details.blocks++;
  }
  score += details.blocks * SCORE.PER_BLOCK;

  // ODD/EVEN bonus rows
  for (let rowIdx = 0; rowIdx < NUM_ROWS; rowIdx++) {
    if (rowRole(rowIdx) !== 'ODD_EVEN') continue;
    const row = ticket[rowIdx];
    if (row.some((cell) => cell === null)) continue; // must be fully populated
    const nums = row.map((cell) => cell.number);
    const allOdd = nums.every((n) => n % 2 === 1);
    const allEven = nums.every((n) => n % 2 === 0);
    if (allOdd || allEven) {
      details.oddEvenRows++;
    }
  }
  score += details.oddEvenRows * SCORE.ODD_EVEN_ROW;

  // ASCENDING bonus rows
  for (let rowIdx = 0; rowIdx < NUM_ROWS; rowIdx++) {
    if (rowRole(rowIdx) !== 'ASCENDING') continue;
    const row = ticket[rowIdx];
    if (row.some((cell) => cell === null)) continue;
    const nums = row.map((cell) => cell.number);
    let ascending = true;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] <= nums[i - 1]) ascending = false;
    }
    if (ascending) details.ascendingRows++;
  }
  score += details.ascendingRows * SCORE.ASCENDING_ROW;

  return { total: score, details };
}
