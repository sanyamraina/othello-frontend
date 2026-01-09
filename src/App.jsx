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
  const [loading, setLoading] = useState(false);

  async function handleCellClick(row, col) {
    if (loading) return;

    try {
      setLoading(true);

      const human = await makeMove({
        board,
        player,
        row,
        col,
        use_ai: false,
      });

      setBoard(human.board);
      setPlayer(human.next_player);

      if (!human.game_over) {
        const ai = await makeMove({
          board: human.board,
          player: human.next_player,
          use_ai: true,
        });

        setBoard(ai.board);
        setPlayer(ai.next_player);
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
      <Board board={board} onCellClick={handleCellClick} />
      {loading && <p>Thinking…</p>}
    </div>
  );
}
