export default function Board({ board, validMoves, onCellClick }) {
  const isValid = (r, c) =>
    validMoves.some(m => m.row === r && m.col === c);

  return (
    <div className="board">
      {board.map((row, r) =>
        row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            className={`cell ${isValid(r, c) ? "valid" : ""}`}
            onClick={() =>
                      (validMoves.length === 0 || isValid(r, c)) &&
                      onCellClick(r, c)
                    }

          >
            {cell === 1 && <div className="black" />}
            {cell === -1 && <div className="white" />}
          </div>
        ))
      )}
    </div>
  );
}
