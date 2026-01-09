import React from "react";

export default function Board({
  board,
  validMoves,
  lastMove,
  currentPlayer,
  onCellClick,
}) {
  function isValidMove(r, c) {
    return validMoves.some((m) => m.row === r && m.col === c);
  }

  return (
    <div className="board">
      {board.map((row, r) =>
        row.map((cell, c) => {
          const valid = isValidMove(r, c);
          const isLast =
            lastMove && lastMove.row === r && lastMove.col === c;

          let pieceClass = "";
          if (cell === 1) pieceClass = "piece black";
          else if (cell === -1) pieceClass = "piece white";

          return (
            <div
              key={`${r}-${c}`}
              className={`cell ${valid ? "valid" : ""}`}
              onClick={() => onCellClick(r, c)}
            >
              {cell !== 0 && (
                <div
                  className={`${pieceClass} ${
                    isLast ? "last-move" : ""
                  }`}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
