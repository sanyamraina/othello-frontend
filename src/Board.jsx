import React from "react";

export default function Board({
  board,
  validMoves,
  lastMove,
  onCellClick,
}) {
  const isValid = (r, c) =>
    validMoves.some((m) => m.row === r && m.col === c);

  return (
    <div className="board">
      {board.map((row, r) =>
        row.map((cell, c) => {
          const last =
            lastMove && lastMove.row === r && lastMove.col === c;

          let piece = "";
          if (cell === 1) piece = "piece black";
          if (cell === -1) piece = "piece white";

          return (
            <div
              key={`${r}-${c}`}
              className={`cell ${isValid(r, c) ? "valid" : ""}`}
              onClick={() => onCellClick(r, c)}
            >
              {cell !== 0 && (
                <div className={`${piece} ${last ? "last-move" : ""}`} />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
