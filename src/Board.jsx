import React, { useEffect, useRef, useState } from "react";

export default function Board({
  board,
  validMoves,
  lastMove,
  flippedTiles,
  onCellClick,
  currentPlayer,
}) {
  const [flipCells, setFlipCells] = useState(new Map());
  const prevBoardRef = useRef(null);
  const flipTimeoutRef = useRef(null);
  const flipDurationMs = 520;

  useEffect(() => {
    const prevBoard = prevBoardRef.current;
    if (prevBoard) {
      const nextFlipCells = new Map();
      for (let r = 0; r < board.length; r += 1) {
        for (let c = 0; c < board[r].length; c += 1) {
          const prevVal = prevBoard[r]?.[c];
          const currVal = board[r]?.[c];
          if (prevVal === undefined || currVal === undefined) continue;
          if (prevVal !== currVal && prevVal !== 0 && currVal !== 0) {
            nextFlipCells.set(`${r}-${c}`, { from: prevVal, to: currVal });
          }
        }
      }

      if (nextFlipCells.size > 0) {
        setFlipCells(nextFlipCells);
        if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current);
        flipTimeoutRef.current = setTimeout(() => {
          setFlipCells(new Map());
          flipTimeoutRef.current = null;
        }, flipDurationMs);
      } else {
        setFlipCells(new Map());
      }
    }

    prevBoardRef.current = board.map((row) => row.slice());
    return () => {
      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
        flipTimeoutRef.current = null;
      }
    };
  }, [board]);
  const isValid = (r, c) =>
    validMoves.some((m) => m.row === r && m.col === c);

  const isFlipped = (r, c) =>
    flippedTiles?.some((t) => t.row === r && t.col === c);

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  return (
    <div className="board">
      {/* top-left empty */}
      <div className="corner" />

      {/* file labels */}
      {files.map((f) => (
        <div className="col-label" key={`col-${f}`}>
          {f}
        </div>
      ))}

      {/* rows */}
      {board.map((row, r) => (
        <React.Fragment key={`row-${r}`}>
          <div className="row-label">{r + 1}</div>

          {row.map((cell, c) => {
            const isLastMove =
              lastMove && lastMove.row === r && lastMove.col === c;

            const flipped = isFlipped(r, c);
            const flipInfo = flipCells.get(`${r}-${c}`);

            let pieceClass = "";
            if (cell === 1) pieceClass = "piece black";
            if (cell === -1) pieceClass = "piece white";
            if (flipInfo) pieceClass += " flip";

            const previewClass =
              currentPlayer === 1
                ? "preview-piece black"
                : "preview-piece white";

            // Enhanced highlighting for history navigation
            let cellClass = "cell";
            if (isLastMove) cellClass += " last-move-cell";
            if (flipped) cellClass += " flipped-cell";

            return (
              <div
                key={`${r}-${c}`}
                className={cellClass}
                onClick={() => onCellClick(r, c)}
              >
                {cell !== 0 && <div className={pieceClass} />}

                {cell === 0 && isValid(r, c) && (
                  <>
                    <div className="move-dot" />
                    <div className={previewClass} />
                  </>
                )}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
