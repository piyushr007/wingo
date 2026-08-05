'use client';

import { NUM_ROWS, NUM_COLUMNS, SYMBOLS, rowRole } from '../lib/gameRules';

export default function TicketGrid({ grid, onCellClick, highlightCells }) {
  return (
    <div className="inline-block rounded-xl border border-wgold/50 bg-wmaroon/70 p-3">
      {/* Column symbol headers */}
      <div className="mb-2 grid grid-cols-[70px_repeat(5,44px)] gap-1">
        <div />
        {SYMBOLS.map((s) => (
          <div
            key={s.key}
            className="flex h-10 w-11 items-center justify-center rounded-md border border-wgold/50 bg-black text-xl"
            title={s.label}
          >
            {s.emoji}
          </div>
        ))}
      </div>

      {Array.from({ length: NUM_ROWS }).map((_, r) => {
        const role = rowRole(r);
        return (
          <div key={r} className="mb-1 grid grid-cols-[70px_repeat(5,44px)] items-center gap-1">
            <div
              className={`rounded px-1 py-1 text-center text-[10px] font-bold ${
                role === 'ODD_EVEN' ? 'bg-blue-900 text-blue-100' : 'bg-red-900 text-red-100'
              }`}
            >
              {role === 'ODD_EVEN' ? 'ODD/EVEN' : 'ASCENDING'}
            </div>
            {Array.from({ length: NUM_COLUMNS }).map((_, c) => {
              const cell = grid?.[r]?.[c] ?? null;
              const isHighlighted = highlightCells?.some((h) => h.row === r && h.col === c);
              const clickable = !!onCellClick && !cell;
              return (
                <div
                  key={c}
                  onClick={clickable ? () => onCellClick(r, c) : undefined}
                  className={[
                    'wingo-cell',
                    !cell ? 'wingo-cell-empty' : '',
                    clickable ? 'wingo-cell-clickable' : '',
                    isHighlighted ? 'ring-2 ring-green-400' : '',
                  ].join(' ')}
                >
                  {cell ? (cell.wild ? `${cell.number}*` : cell.number) : ''}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
