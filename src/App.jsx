import { useState, useEffect } from "react";
import Board from "./Board";
import { makeMove } from "./api";
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

function colorName(p) {
  return p === 1 ? "Black" : "White";
}
function colorKey(p) {
  return p === 1 ? "black" : "white";
}

export default function App() {
  const [board, setBoard] = useState(initialBoard);
  const [player, setPlayer] = useState(1); // 1 = Black, -1 = White
  const [validMoves, setValidMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [loading, setLoading] = useState(false);

  // Game configuration
  const [mode, setMode] = useState("HUMAN_VS_AI"); // "HUMAN_VS_HUMAN" | "HUMAN_VS_AI"
  const [aiColor, setAiColor] = useState(-1); // 1 = Black AI, -1 = White AI (only used in HUMAN_VS_AI)

  // Initial legal moves (temporary bootstrap)
  useEffect(() => {
    setValidMoves([
      { row: 2, col: 3 },
      { row: 3, col: 2 },
      { row: 4, col: 5 },
      { row: 5, col: 4 },
    ]);
  }, []);

  // If it's AI's turn, trigger AI move automatically (also handles AI as Black on move 1)
  useEffect(() => {
    if (mode !== "HUMAN_VS_AI") return;
    if (loading) return;
    if (player !== aiColor) return;

    (async () => {
      try {
        setLoading(true);

        const ai = await makeMove({
          board,
          player,
          use_ai: true,
        });

        const aiMove = findLastMove(board, ai.board);

        setBoard(ai.board);
        setPlayer(ai.next_player);
        setValidMoves(ai.valid_moves);

        if (aiMove) {
          setLastMove({ ...aiMove, by: colorKey(player) });
        }

        // if game over, backend will signal it; we simply stop as state updates end the loop
      } finally {
        setLoading(false);
      }
    })();
  }, [board, player, mode, aiColor, loading]);

  async function handleCellClick(row, col) {
    if (loading) return;

    // In Human vs AI, ignore clicks when it's AI's turn
    if (mode === "HUMAN_VS_AI" && player === aiColor) return;

    // If the user clicks an invalid square, just ignore
    const isValid = validMoves.some((m) => m.row === row && m.col === col);
    if (validMoves.length > 0 && !isValid) return;

    try {
      setLoading(true);

      const result = await makeMove({
        board,
        player,
        row,
        col,
        use_ai: false,
      });

      setBoard(result.board);
      setPlayer(result.next_player);
      setValidMoves(result.valid_moves);
      setLastMove({ row, col, by: colorKey(player) });

      // No direct AI call here anymore — the useEffect above handles AI turns cleanly.
    } finally {
      setLoading(false);
    }
  }

  function resetGame() {
    setBoard(initialBoard);
    setPlayer(1);
    setLastMove(null);
    setLoading(false);

    // reset valid moves bootstrap
    setValidMoves([
      { row: 2, col: 3 },
      { row: 3, col: 2 },
      { row: 4, col: 5 },
      { row: 5, col: 4 },
    ]);
  }

  const aiEnabled = mode === "HUMAN_VS_AI";
  const aiPlays = aiEnabled ? colorName(aiColor) : "None";

  return (
    <div className="app">
      <h1>Othello</h1>

      <div style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
        <label>
          Mode:&nbsp;
          <select
            value={mode}
            onChange={(e) => {
              const nextMode = e.target.value;
              setMode(nextMode);
              // keep aiColor as-is; it only matters in HUMAN_VS_AI
            }}
          >
            <option value="HUMAN_VS_AI">Human vs AI</option>
            <option value="HUMAN_VS_HUMAN">Human vs Human</option>
          </select>
        </label>

        <label>
          AI Color:&nbsp;
          <select
            value={aiColor}
            onChange={(e) => setAiColor(Number(e.target.value))}
            disabled={!aiEnabled}
          >
            <option value={1}>Black</option>
            <option value={-1}>White</option>
          </select>
        </label>

        <button onClick={resetGame}>Reset</button>
      </div>

      <p style={{ marginTop: 12 }}>
        Turn: <strong>{colorName(player)}</strong>
        {aiEnabled && (
          <>
            &nbsp;|&nbsp;AI: <strong>{aiPlays}</strong>
          </>
        )}
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
