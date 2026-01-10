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

  const [mode, setMode] = useState("HUMAN_VS_AI");
  const [humanColor, setHumanColor] = useState(1);

  const [phase, setPhase] = useState("SETUP"); // SETUP | PLAYING | GAME_OVER
  const [winner, setWinner] = useState(null);
  const [finalScore, setFinalScore] = useState(null);

  const aiColor = mode === "HUMAN_VS_AI" ? -humanColor : null;
  const liveScore = countPieces(board);

  // ---------- AI MOVE ----------
  useEffect(() => {
    if (phase !== "PLAYING") return;
    if (mode !== "HUMAN_VS_AI") return;
    if (player !== aiColor) return;
    if (loading) return;

    (async () => {
      try {
        setLoading(true);
        const res = await makeAIMove({ board, player });

        setBoard(res.board);
        setPlayer(res.next_player);
        setValidMoves(res.valid_moves || []);
        setLastMove(res.move || null);
      } finally {
        setLoading(false);
      }
    })();
  }, [board, player, phase, mode, aiColor, loading]);

  // ---------- GAME OVER CHECK ----------
  useEffect(() => {
    if (phase !== "PLAYING") return;
    if (validMoves.length !== 0) return;

    const opponent = -player;

    (async () => {
      try {
        const res = await makeAIMove({ board, player: opponent });

        if (!res.valid_moves || res.valid_moves.length === 0) {
          const score = countPieces(board);
          setFinalScore(score);

          if (score.black > score.white) setWinner(1);
          else if (score.white > score.black) setWinner(-1);
          else setWinner("DRAW");

          setPhase("GAME_OVER");
        }
      } catch {}
    })();
  }, [validMoves, board, player, phase]);

  async function handleCellClick(row, col) {
    if (phase !== "PLAYING" || loading) return;
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
    } finally {
      setLoading(false);
    }
  }

  function startGame() {
    setBoard(initialBoard);
    setPlayer(1);
    setValidMoves(initialValidMoves);
    setLastMove(null);
    setWinner(null);
    setFinalScore(null);
    setPhase("PLAYING");
  }

  function resetGame() {
    setPhase("SETUP");
  }

  function gameOverMessage() {
    if (winner === "DRAW") return "🤝 It’s a Draw";

    if (mode === "HUMAN_VS_AI") {
      return winner === humanColor
        ? "🎉 You Won!"
        : "🤖 AI Won — You Lost";
    }

    return `${colorName(winner)} Wins`;
  }

  function scoreLabel(color) {
    if (mode === "HUMAN_VS_AI") {
      return color === humanColor ? "You" : "AI";
    }
    return colorName(color);
  }

  return (
    <div className="container-fluid min-vh-100 d-flex flex-column align-items-center">
      <h1 className="mt-4">Othello</h1>

      {/* ---------- STATUS BAR ---------- */}
      {phase !== "SETUP" && (
        <div className="status-bar">
          <span>
            Mode:{" "}
            <strong>
              {mode === "HUMAN_VS_AI" ? "Human vs AI" : "Human vs Human"}
            </strong>
          </span>

          <span className="live-score">
            <strong>{scoreLabel(1)}</strong>: {liveScore.black} &nbsp;|&nbsp;
            <strong>{scoreLabel(-1)}</strong>: {liveScore.white}
          </span>

          <span>
            Turn: <strong>{colorName(player)}</strong>
          </span>

          <button onClick={resetGame}>Reset</button>
        </div>
      )}

      <Board
        board={board}
        validMoves={phase === "PLAYING" ? validMoves : []}
        lastMove={lastMove}
        onCellClick={handleCellClick}
        currentPlayer={player}
      />

      {loading && phase === "PLAYING" && <p>Thinking…</p>}

      {/* ---------- SETUP OVERLAY ---------- */}
      {phase === "SETUP" && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>Game Setup</h2>

            <label>
              Mode:
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="HUMAN_VS_AI">Human vs AI</option>
                <option value="HUMAN_VS_HUMAN">Human vs Human</option>
              </select>
            </label>

            {mode === "HUMAN_VS_AI" && (
              <label>
                Your Color:
                <select
                  value={humanColor}
                  onChange={(e) => setHumanColor(Number(e.target.value))}
                >
                  <option value={1}>Black</option>
                  <option value={-1}>White</option>
                </select>
              </label>
            )}

            <button onClick={startGame}>Start Game</button>
          </div>
        </div>
      )}

      {/* ---------- GAME OVER OVERLAY ---------- */}
      {phase === "GAME_OVER" && finalScore && (
        <div className="overlay">
          <div className="overlay-card game-over">
            <h2>Game Over</h2>
            <p className="game-over-message">{gameOverMessage()}</p>

            <div className="score-breakdown">
              <div>
                <strong>{scoreLabel(1)}</strong>
                <span>{finalScore.black}</span>
              </div>
              <div>
                <strong>{scoreLabel(-1)}</strong>
                <span>{finalScore.white}</span>
              </div>
            </div>

            <button onClick={resetGame}>New Game</button>
          </div>
        </div>
      )}
    </div>
  );
}
