import { useState } from "react";
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

export default function App() {
  const [board, setBoard] = useState(initialBoard);
  const [player, setPlayer] = useState(1);
  const [validMoves, setValidMoves] = useState([]); 
  const [loading, setLoading] = useState(false);

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

      if (human.game_over) {
        alert(
          human.winner === null
            ? "Draw!"
            : human.winner === 1
            ? "Black wins!"
            : "White wins!"
        );
        return;
      }

      // ---------- AI MOVE ----------
      const ai = await makeMove({
        board: human.board,
        player: human.next_player,
        use_ai: true,
      });

      setBoard(ai.board);
      setPlayer(ai.next_player);
      setValidMoves(ai.valid_moves);  

      if (ai.game_over) {
        alert(
          ai.winner === null
            ? "Draw!"
            : ai.winner === 1
            ? "Black wins!"
            : "White wins!"
        );
      }

    } catch (e) {
      alert(e.message);
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
        onCellClick={handleCellClick}
      />

      {loading && <p>Thinking…</p>}
    </div>
  );
}
