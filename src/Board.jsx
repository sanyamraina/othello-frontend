export default function Board({ board, onCellClick }) {
  return (
    <div className="board">
      {board.map((row, r) =>
        row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            className="cell"
            onClick={() => onCellClick(r, c)}
          >
            {cell === 1 && <div className="black" />}
            {cell === -1 && <div className="white" />}
          </div>
        ))
      )}
    </div>
  );
}
