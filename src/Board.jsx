export default function Board({
  board,
  validMoves,
  lastMove,
  currentPlayer,
  onCellClick,
}) {
  const isValid = (r, c) =>
    validMoves.some(m => m.row === r && m.col === c);

  const isLastMove = (r, c) =>
    lastMove && lastMove.row === r && lastMove.col === c;

  return (
    <div className="board">
      {board.map((row, r) =>
        row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            className="cell"
            onClick={() =>
              (validMoves.length === 0 || isValid(r, c)) &&
              onCellClick(r, c)
            }
          >
            {/* DISC */}
            {cell === 1 && <div className="black" />}
            {cell === -1 && <div className="white" />}

            {/* VALID MOVE GHOST DISC */}
            {cell === 0 && isValid(r, c) && (
              <div
                className={`ghost ${
                  currentPlayer === 1 ? "ghost-black" : "ghost-white"
                }`}
              />
            )}

            {/* LAST MOVE RING */}
            {isLastMove(r, c) && (
              <div
                className={`last-move-ring ${
                  lastMove.by === "ai" ? "ring-ai" : "ring-human"
                }`}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}
