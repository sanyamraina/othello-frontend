import { useEffect, useState } from "react";
import Board from "./Board";
import { makeMove, makeAIMove } from "./api";
import "./styles.css";

const initialBoard = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, -1, 1, 0, 0, 0],
  [0, 0, 0, 1, -1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const initialValidMoves = [
  { row: 2, col: 3 },
  { row: 3, col: 2 },
  { row: 4, col: 5 },
  { row: 5, col: 4 },
];

function colorName(p) {
  return p === 1 ? "Black" : "White";
}

function countPieces(board) {
  let black = 0;
  let white = 0;

  for (const row of board) {
    for (const cell of row) {
      if (cell === 1) black++;
      if (cell === -1) white++;
    }
  }

  return { black, white };
}

export default function App() {
  const [board, setBoard] = useState(initialBoard);
  const [player, setPlayer] = useState(1);
  const [validMoves, setValidMoves] = useState(initialValidMoves);
  const [lastMove, setLastMove] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mode, setMode] = useState("HUMAN_VS_AI");
  const [aiColor, setAiColor] = useState(-1);

  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);

  // ---------- AI MOVE ----------
  useEffect(() => {
    if (mode !== "HUMAN_VS_AI") return;
    if (player !== aiColor) return;
    if (loading || gameOver) return;

    (async () => {
      try {
        setLoading(true);
        const res = await makeAIMove({ board, player });

        setBoard(res.board);
        setPlayer(res.next_player);
        setValidMoves(res.valid_moves || []);
        setLastMove(res.move || null);
      } catch (e) {
        setError(e.message || "AI move failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [board, player, mode, aiColor, loading, gameOver]);

  // ---------- GAME OVER CHECK ----------
  useEffect(() => {
    if (gameOver) return;
    if (validMoves.length !== 0) return;

    const opponent = -player;

    (async () => {
      try {
        const res = await makeAIMove({ board, player: opponent });

        if (!res.valid_moves || res.valid_moves.length === 0) {
          const { black, white } = countPieces(board);

          if (black > white) setWinner("Black");
          else if (white > black) setWinner("White");
          else setWinner("Draw");

          setGameOver(true);
        }
      } catch {
        // ignore
      }
    })();
  }, [validMoves, board, player, gameOver]);

  async function handleCellClick(row, col) {
    if (loading || gameOver) return;
    if (mode === "HUMAN_VS_AI" && player === aiColor) return;

    const isValid = validMoves.some((m) => m.row === row && m.col === col);
    if (!isValid) return;

    try {
      setLoading(true);
      const res = await makeMove({ board, player, row, col });

      setBoard(res.board);
      setPlayer(res.next_player);
      setValidMoves(res.valid_moves || []);
      setLastMove({ row, col });
    } catch (e) {
      setError(e.message || "Move failed");
    } finally {
      setLoading(false);
    }
  }

  function resetGame() {
    setBoard(initialBoard);
    setPlayer(1);
    setValidMoves(initialValidMoves);
    setLastMove(null);
    setLoading(false);
    setError("");
    setGameOver(false);
    setWinner(null);
  }

  return (
    <div className="container-fluid min-vh-100 d-flex flex-column align-items-center">
      <h1 className="mt-4">Othello</h1>

      <div className="d-flex flex-wrap gap-3 my-3 align-items-center">
        <label>
          Mode:&nbsp;
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="HUMAN_VS_AI">Human vs AI</option>
            <option value="HUMAN_VS_HUMAN">Human vs Human</option>
          </select>
        </label>

        <label>
          AI Color:&nbsp;
          <select
            value={aiColor}
            onChange={(e) => setAiColor(Number(e.target.value))}
            disabled={mode !== "HUMAN_VS_AI"}
          >
            <option value={1}>Black</option>
            <option value={-1}>White</option>
          </select>
        </label>

        <button onClick={resetGame}>Reset</button>
      </div>

      <p>
        Turn: <strong>{colorName(player)}</strong>
      </p>

      {error && (
        <div className="alert alert-danger py-2 px-3">{error}</div>
      )}

      <Board
        board={board}
        validMoves={validMoves}
        lastMove={lastMove}
        onCellClick={handleCellClick}
      />

      {loading && <p className="mt-2">Thinking…</p>}

      {gameOver && (
        <div className="game-over-overlay">
          <div className="game-over-card">
            <h2>Game Over</h2>
            <p>
              {winner === "Draw"
                ? "It's a Draw!"
                : `${winner} Wins`}
            </p>
            <button onClick={resetGame}>Play Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
