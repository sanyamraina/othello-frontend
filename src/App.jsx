import { useState, useEffect } from "react";
import Board from "./Board";
import { makeMove } from "./api";
import "./styles.css";

const initialBoard = [
  [0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0],
  [0,0,0,-1,1,0,0,0],
  [0,0,0,1,-1,0,0,0],
  [0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0],
];

function findLastMove(prevBoard, newBoard) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (prevBoard[r][c] === 0 && newBoard[r][c] !== 0) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export default function App() {
  const [board, setBoard] = useState(initialBoard);
  const [player, setPlayer] = useState(1);
  const [validMoves, setValidMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [loading, setLoading] = useState(false);

  // Initial legal moves (temporary bootstrap)
  useEffect(() => {
    setValidMoves([
      { row: 2, col: 3 },
      { row: 3, col: 2 },
      { row: 4, col: 5 },
      { row: 5, col: 4 },
    ]);
  }, []);

  async function handleCellClick(row, col) {
    if (loading) return;

    try {
      setLoading(true);

      // ---------- HUMAN MOVE ----------
      const human = await makeMove({
        board,
        player,
        row,
        col,
        use_ai: false,
      });

      setBoard(human.board);
      setPlayer(human.next_player);
      setValidMoves(human.valid_moves);
      setLastMove({ row, col, by: "human" });

      if (human.game_over) return;

      // ---------- AI MOVE ----------
      const ai = await makeMove({
        board: human.board,
        player: human.next_player,
        use_ai: true,
      });

      const aiMove = findLastMove(human.board, ai.board);

      setBoard(ai.board);
      setPlayer(ai.next_player);
      setValidMoves(ai.valid_moves);

      if (aiMove) {
        setLastMove({ ...aiMove, by: "ai" });
      }

    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <h1>Othello</h1>

      <p>
        Turn: <strong>{player === 1 ? "Black" : "White"}</strong>
      </p>

      <Board
        board={board}
        validMoves={validMoves}
        lastMove={lastMove}
        currentPlayer={player}
        onCellClick={handleCellClick}
      />

      {loading && <p>Thinking…</p>}
    </div>
  );
}
