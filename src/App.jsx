import { useEffect, useState, useRef } from "react";
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
  const [history, setHistory] = useState([]); // stack of previous states for undo
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState("HUMAN_VS_AI");
  const [humanColor, setHumanColor] = useState(1);

  const [phase, setPhase] = useState("SETUP"); // SETUP | PLAYING | GAME_OVER
  const [winner, setWinner] = useState(null);
  const [finalScore, setFinalScore] = useState(null);

  const aiColor = mode === "HUMAN_VS_AI" ? -humanColor : null;
  const liveScore = countPieces(board);
  const aiRequestIdRef = useRef(0);

  // ---------- AI MOVE ----------
  useEffect(() => {
    if (phase !== "PLAYING") return;
    if (mode !== "HUMAN_VS_AI") return;
    if (player !== aiColor) return;
    if (loading) return;

    (async () => {
      try {
        setLoading(true);
        const reqId = Date.now();
        aiRequestIdRef.current = reqId;

        // push current state to history so undo can restore it
        setHistory((h) => [
          ...h,
          {
            board: board.map((r) => r.slice()),
            player,
            validMoves,
            lastMove,
            phase,
            winner,
            finalScore,
          },
        ]);

        const res = await makeAIMove({ board, player });

        // if request was cancelled (undo pressed) ignore response
        if (aiRequestIdRef.current !== reqId) {
          aiRequestIdRef.current = 0;
          return;
        }

        aiRequestIdRef.current = 0;

        setBoard(res.board);

        if (res.game_over) {
          const score = countPieces(res.board);
          setFinalScore(score);

          if (res.winner === 1) setWinner(1);
          else if (res.winner === -1) setWinner(-1);
          else setWinner("DRAW");

          setPhase("GAME_OVER");
        } else {
          setPlayer(res.next_player);
          setValidMoves(normalizeMoves(res.valid_moves));
          setLastMove(res.move || null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [board, player, phase, mode, aiColor, loading]);

  // ---------- GAME OVER CHECK ----------
  // useEffect(() => {
  //   if (phase !== "PLAYING") return;
  //   if (validMoves.length !== 0) return;

  //   const opponent = -player;

  //   (async () => {
  //     try {
  //       const res = await makeAIMove({ board, player: opponent });

  //       if (!res.valid_moves || res.valid_moves.length === 0) {
  //         const score = countPieces(board);
  //         setFinalScore(score);

  //         if (score.black > score.white) setWinner(1);
  //         else if (score.white > score.black) setWinner(-1);
  //         else setWinner("DRAW");

  //         setPhase("GAME_OVER");
  //       }
  //     } catch {}
  //   })();
  // }, [validMoves, board, player, phase]);


  // ---------- NEW GAME OVER CHECK ----------

  useEffect(() => {
    if (phase !== "PLAYING") return;

    if (validMoves.length > 0) return;

    (async () => {
      try {
        // Current player must PASS
        const nextPlayer = -player;

        const res = await fetch("http://127.0.0.1:8000/valid-moves", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ board, player: nextPlayer }),
        }).then(r => r.json());

        // BOTH players have no moves → GAME OVER
        if (!res.valid_moves || res.valid_moves.length === 0) {
          const score = countPieces(board);
          setFinalScore(score);

          if (score.black > score.white) setWinner(1);
          else if (score.white > score.black) setWinner(-1);
          else setWinner("DRAW");

          setPhase("GAME_OVER");
          return;
        }

        // PASS: switch turn
        setPlayer(nextPlayer);
        setValidMoves(normalizeMoves(res.valid_moves));
        setLastMove(null);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [validMoves, board, player, phase]);

    
  function normalizeMoves(moves) {
    if (!Array.isArray(moves)) return [];
    if (moves.length === 0) return [];

    // already [{row,col}]
    if (typeof moves[0] === "object" && moves[0] !== null && "row" in moves[0]) return moves;

    // tuple/list form [[r,c], ...]
    if (Array.isArray(moves[0]) && moves[0].length === 2) {
      return moves.map(([row, col]) => ({ row, col }));
    }

    return [];
  }

    

  async function handleCellClick(row, col) {
    if (phase !== "PLAYING" || loading) return;
    if (mode === "HUMAN_VS_AI" && player === aiColor) return;

    const isValid = validMoves.some((m) => m.row === row && m.col === col);
    if (!isValid) return;

    try {
      setLoading(true);
      // push current state so it can be undone
      setHistory((h) => [
        ...h,
        {
          board: board.map((r) => r.slice()),
          player,
          validMoves,
          lastMove,
          phase,
          winner,
          finalScore,
        },
      ]);

      // cancel any pending AI request (if user plays while AI was pending)
      if (aiRequestIdRef.current) aiRequestIdRef.current = 0;

      const res = await makeMove({ board, player, row, col });

      setBoard(res.board);

      if (res.game_over) {
        const score = countPieces(res.board);
        setFinalScore(score);

        if (res.winner === 1) setWinner(1);
        else if (res.winner === -1) setWinner(-1);
        else setWinner("DRAW");

        setPhase("GAME_OVER");
      } else {
        setPlayer(res.next_player);
        setValidMoves(normalizeMoves(res.valid_moves));
        setLastMove({ row, col });
      }
    } finally {
      setLoading(false);
    }
  }

  function undoMove() {
    if (!history || history.length === 0) return;

    // If an AI request is pending, cancel it and undo the human move
    if (aiRequestIdRef.current) {
      aiRequestIdRef.current = 0;
      const prev = history[history.length - 1];
      setHistory((h) => h.slice(0, h.length - 1));

      setBoard(prev.board.map((r) => r.slice()));
      setPlayer(prev.player);
      setValidMoves(prev.validMoves || []);
      setLastMove(prev.lastMove || null);
      setPhase(prev.phase || "PLAYING");
      setWinner(prev.winner || null);
      setFinalScore(prev.finalScore || null);
      return;
    }

    // In Human vs AI mode, undo full human+AI turn when AI moved last
    if (mode === "HUMAN_VS_AI") {
      const last = history[history.length - 1];
      if (last && last.player === aiColor && history.length >= 2) {
        const restored = history[history.length - 2];
        setHistory((h) => h.slice(0, h.length - 2));

        setBoard(restored.board.map((r) => r.slice()));
        setPlayer(restored.player);
        setValidMoves(restored.validMoves || []);
        setLastMove(restored.lastMove || null);
        setPhase(restored.phase || "PLAYING");
        setWinner(restored.winner || null);
        setFinalScore(restored.finalScore || null);
        return;
      }
    }

    // Default: pop one snapshot
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, h.length - 1));

    setBoard(prev.board.map((r) => r.slice()));
    setPlayer(prev.player);
    setValidMoves(prev.validMoves || []);
    setLastMove(prev.lastMove || null);
    setPhase(prev.phase || "PLAYING");
    setWinner(prev.winner || null);
    setFinalScore(prev.finalScore || null);
  }

  function handlePassIfNeeded(board, currentPlayer, moves) {
    if (moves.length > 0) return false;

    const nextPlayer = -currentPlayer;
    return nextPlayer;
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
          <div className="status-left">
            <div className="mode-label">
              Mode: <strong>{mode === "HUMAN_VS_AI" ? "Human vs AI" : "Human vs Human"}</strong>
            </div>

            <div className="live-score">
              <div className="score-pill black-pill">
                <span className="dot" />
                <span className="label">{scoreLabel(1)}</span>
                <span className="value">{liveScore.black}</span>
              </div>

              <div className="score-pill white-pill">
                <span className="dot" />
                <span className="label">{scoreLabel(-1)}</span>
                <span className="value">{liveScore.white}</span>
              </div>
            </div>
          </div>

          <div className="status-right">
            <div className="turn-label">
              Turn: <strong>{colorName(player)}</strong>
            </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="reset-btn" onClick={resetGame}>Reset</button>
                <button className="reset-btn" onClick={undoMove} disabled={history.length === 0} title={history.length ? 'Undo last move' : 'No moves to undo'}>
                  Undo
                </button>
              </div>
          </div>
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
            <p className="muted">Quickly choose a mode and your color to begin.</p>

            <div className="setup-form">
              <label>
                <span>Mode</span>
                <div className="mode-choices">
                  <button
                    type="button"
                    className={mode === "HUMAN_VS_AI" ? "btn mode active" : "btn mode"}
                    onClick={() => setMode("HUMAN_VS_AI")}
                  >
                    Human vs AI
                  </button>
                  <button
                    type="button"
                    className={mode === "HUMAN_VS_HUMAN" ? "btn mode active" : "btn mode"}
                    onClick={() => setMode("HUMAN_VS_HUMAN")}
                  >
                    Human vs Human
                  </button>
                </div>
              </label>

              {mode === "HUMAN_VS_AI" && (
                <label>
                  <span>Your Color</span>
                  <div className="color-choices">
                    <button type="button" className={humanColor===1?"btn color active":"btn color"} onClick={() => setHumanColor(1)}>Black</button>
                    <button type="button" className={humanColor===-1?"btn color active":"btn color"} onClick={() => setHumanColor(-1)}>White</button>
                  </div>
                </label>
              )}
            </div>

            <div className="actions">
              <button className="btn primary" onClick={startGame}>Start Game</button>
            </div>
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
              <div className="score-card">
                <strong>{scoreLabel(1)}</strong>
                <span>{finalScore.black}</span>
              </div>
              <div className="score-card">
                <strong>{scoreLabel(-1)}</strong>
                <span>{finalScore.white}</span>
              </div>
            </div>

            <div className="actions">
              <button className="btn primary" onClick={resetGame}>
                New Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
