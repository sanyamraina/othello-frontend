import React from "react";

export default function Board({
  board,
  validMoves,
  lastMove,
  onCellClick,
  currentPlayer,
}) {
  const isValid = (r, c) =>
    validMoves.some((m) => m.row === r && m.col === c);
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

      {/* rows with row label + cells */}
      {board.map((row, r) => (
        <React.Fragment key={`row-${r}`}>
          <div className="row-label">{r + 1}</div>
          {row.map((cell, c) => {
            const last = lastMove && lastMove.row === r && lastMove.col === c;

            let piece = "";
            if (cell === 1) piece = "piece black";
            if (cell === -1) piece = "piece white";

            const previewClass =
              currentPlayer === 1 ? "preview-piece black" : "preview-piece white";

            return (
              <div
                key={`${r}-${c}`}
                className="cell"
                onClick={() => onCellClick(r, c)}
              >
                {cell !== 0 && (
                  <div className={`${piece} ${last ? "last-move" : ""}`} />
                )}

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
