import React from "react";

export default function Board({
  board,
  validMoves,
  lastMove,
  flippedTiles,
  onCellClick,
  currentPlayer,
}) {
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

            let pieceClass = "";
            if (cell === 1) pieceClass = "piece black";
            if (cell === -1) pieceClass = "piece white";

            const previewClass =
              currentPlayer === 1
                ? "preview-piece black"
                : "preview-piece white";

            return (
              <div
                key={`${r}-${c}`}
                className={`cell ${
                  isLastMove || flipped ? "last-move-cell" : ""
                }`}
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
