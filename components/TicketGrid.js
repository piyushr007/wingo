'use client';

import { NUM_ROWS, NUM_COLUMNS, SYMBOLS, rowRole, ROWS_PER_BLOCK } from '../lib/gameRules';

export default function TicketGrid({ grid, onCellClick, highlightCells }) {
  return (
    <div className="inline-block rounded-xl border border-wgold/50 bg-wmaroon/70 p-2">
      {/* Column symbol headers */}
      <div className="mb-1 grid grid-cols-[56px_repeat(5,34px)] gap-0.5">
        <div />
        {SYMBOLS.map((s) => (
          <div
            key={s.key}
            className="flex h-8 w-[34px] items-center justify-center rounded border border-wgold/50 bg-black text-base"
            title={s.label}
          >
            {s.emoji}
          </div>
        ))}
      </div>

      {Array.from({ length: NUM_ROWS }).map((_, r) => {
        const role = rowRole(r);
        const isLastRowOfBlock = r % ROWS_PER_BLOCK === ROWS_PER_BLOCK - 1;
        return (
          <div
            key={r}
            className={`grid grid-cols-[56px_repeat(5,34px)] items-center gap-0.5 py-0.5 ${
              isLastRowOfBlock && r !== NUM_ROWS - 1 ? 'mb-1.5 border-b border-wgold/20 pb-1.5' : ''
            }`}
          >
            <div
              className={`rounded px-1 py-1 text-center text-[9px] font-bold leading-tight ${
                role === 'ODD_EVEN'
                  ? 'bg-blue-900 text-blue-100'
                  : role === 'ASCENDING'
                  ? 'bg-red-900 text-red-100'
                  : 'bg-transparent text-transparent'
              }`}
            >
              {role === 'ODD_EVEN' ? 'ODD/EVEN' : role === 'ASCENDING' ? 'ASCENDING' : '.'}
            </div>
            {Array.from({ length: NUM_COLUMNS }).map((_, c) => {
              const cell = grid?.[r]?.[c] ?? null;
              const isHighlighted = highlightCells?.some((h) => h.row === r && h.col === c);
              const clickable = !!onCellClick && !cell && isHighlighted;
              return (
                <div
                  key={c}
                  onClick={clickable ? () => onCellClick(r, c) : undefined}
                  className={[
                    'wingo-cell',
                    '!h-8 !w-[34px] !text-xs',
                    !cell ? 'wingo-cell-empty' : '',
                    clickable ? '!cursor-pointer !bg-green-400 !text-wmaroon !opacity-100 animate-pulse' : '',
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
