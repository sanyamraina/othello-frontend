import { useEffect, useState, useRef } from "react";
import Board from "./Board";
import { makeMove, makeAIMove, fetchValidMoves } from "./api";
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
  /**
   * MoveNode shape for move tree
   * @typedef {Object} MoveNode
   * @property {number|null} row - Row index of the move (null for root)
   * @property {number|null} col - Column index of the move (null for root)
   * @property {string|number|null} player - Player who made the move (null for root)
   * @property {string|null} parentId - Parent node id (null for root)
   * @property {string[]} children - Child node ids
   * @property {number[][]} boardAfter - Board state after move
   */

  const [board, setBoard] = useState(initialBoard);
  const [player, setPlayer] = useState(1);
  const [validMoves, setValidMoves] = useState(initialValidMoves);
  const [lastMove, setLastMove] = useState(null);
  const [moves, setMoves] = useState([]); // sequential move history
  const [loading, setLoading] = useState(false);
  const [flippedTiles, setFlippedTiles] = useState([]);
  const [historyViewMode, setHistoryViewMode] = useState(false);

  const [mode, setMode] = useState("HUMAN_VS_AI");
  const [humanColor, setHumanColor] = useState(1);

  const [phase, setPhase] = useState("SETUP"); // SETUP | PLAYING | GAME_OVER
  const [winner, setWinner] = useState(null);
  const [finalScore, setFinalScore] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // Move tree state
  const moveTreeRef = useRef(new Map());
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const moveTreeNodeIdRef = useRef(0);
  const aiColor = mode === "HUMAN_VS_AI" ? -humanColor : null;
  const liveScore = countPieces(board);
  const aiRequestIdRef = useRef(0);

  function nextMoveTreeNodeId() {
    moveTreeNodeIdRef.current += 1;
    return `n${moveTreeNodeIdRef.current}`;
  }

  function ensureMoveTreeRoot(boardForRoot) {
    if (!moveTreeRef.current || !(moveTreeRef.current instanceof Map)) {
      moveTreeRef.current = new Map();
    }

    if (moveTreeRef.current.has("root")) return;

    const rootNode = {
      id: "root",
      player: null,
      row: null,
      col: null,
      boardAfter: (boardForRoot || initialBoard).map((r) => r.slice()),
      flipped: [],
      nextPlayer: 1,
      validMovesNext: initialValidMoves.map((m) => ({ ...m })),
      parentId: null,
      children: [],
    };
    moveTreeRef.current.set("root", rootNode);
  }

  // ---------- AI MOVE ----------
  useEffect(() => {
    if (phase !== "PLAYING") return;
    if (mode !== "HUMAN_VS_AI") return;
    if (player !== aiColor) return;
    if (loading) return;
    if (historyViewMode) return;

    (async () => {
      try {
        setLoading(true);
        const reqId = Date.now();
        aiRequestIdRef.current = reqId;

        const res = await makeAIMove({ board, player });

        // if request was cancelled (undo pressed) ignore response
        if (aiRequestIdRef.current !== reqId) {
          aiRequestIdRef.current = 0;
          return;
        }

        aiRequestIdRef.current = 0;

        setBoard(res.board);

        // --- Move tree: ensure root exists, then record AI move OR AI pass as a node ---
        ensureMoveTreeRoot(board);

        const parentIdForAI =
          currentNodeId && moveTreeRef.current.has(currentNodeId) ? currentNodeId : "root";
        const parentNodeForAI = moveTreeRef.current.get(parentIdForAI);

        let createdNodeId = null;

        if (parentNodeForAI) {
          const isAIMove = res.move && typeof res.move.row === "number";
          const nodeId = nextMoveTreeNodeId();
          const node = {
            id: nodeId,
            player,
            row: isAIMove ? res.move.row : null,
            col: isAIMove ? res.move.col : null,
            boardAfter: res.board.map((r) => r.slice()),
            flipped: res.flipped || [],
            nextPlayer: res.game_over ? null : res.next_player,
            validMovesNext: res.game_over ? [] : normalizeMoves(res.valid_moves),
            parentId: parentNodeForAI.id,
            children: [],
          };
          moveTreeRef.current.set(nodeId, node);
          parentNodeForAI.children.push(nodeId);
          setCurrentNodeId(nodeId);
          createdNodeId = nodeId;
        }
        // record AI move if provided
        if (res.move && typeof res.move.row === "number") {
          setMoves((m) => [
            ...m,
            {
              nodeId: createdNodeId,
              player,
              row: res.move.row,
              col: res.move.col,
              source: "AI",
              board: res.board.map(r => r.slice()),
              flipped: res.flipped || [],
              validMoves: normalizeMoves(res.valid_moves),
              nextPlayer: res.game_over ? null : res.next_player,
              moveType: "move",
              score: countPieces(res.board),
              phase: res.game_over ? "GAME_OVER" : "PLAYING",
              winner: res.winner ?? null,
            },
          ]);
        } else {
          // AI pass
          setMoves((m) => [
            ...m,
            {
              nodeId: createdNodeId,
              player,
              row: null,
              col: null,
              source: "AI",
              board: res.board.map(r => r.slice()),
              flipped: [],
              validMoves: normalizeMoves(res.valid_moves),
              nextPlayer: res.game_over ? null : res.next_player,
              moveType: "pass",
              score: countPieces(res.board),
              phase: res.game_over ? "GAME_OVER" : "PLAYING",
              winner: res.winner ?? null,
            },
          ]);
        }

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
          setFlippedTiles(res.flipped || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [board, player, phase, mode, aiColor, loading, historyViewMode]);

  // ---------- NEW GAME OVER CHECK ----------

  useEffect(() => {
    if (phase !== "PLAYING") return;
    if (loading) return;
    if (mode === "HUMAN_VS_AI" && player === aiColor) return;
    if (historyViewMode) return;
    if (validMoves.length > 0) return;

    (async () => {
      try {
        // Current player must PASS
        const nextPlayer = -player;

        const res = await fetchValidMoves({ board, player: nextPlayer });

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
        // Record pass as a move-tree node (board doesn't change, but turn does)
        ensureMoveTreeRoot(board);
        const parentIdForPass =
          currentNodeId && moveTreeRef.current.has(currentNodeId) ? currentNodeId : "root";
        const parentNodeForPass = moveTreeRef.current.get(parentIdForPass);

        let passNodeId = null;
        if (parentNodeForPass) {
          const nodeId = nextMoveTreeNodeId();
          const node = {
            id: nodeId,
            player,
            row: null,
            col: null,
            boardAfter: board.map((r) => r.slice()),
            flipped: [],
            nextPlayer,
            validMovesNext: normalizeMoves(res.valid_moves),
            parentId: parentNodeForPass.id,
            children: [],
          };
          moveTreeRef.current.set(nodeId, node);
          parentNodeForPass.children.push(nodeId);
          setCurrentNodeId(nodeId);
          passNodeId = nodeId;
        }

        setMoves((m) => [
          ...m,
          {
            nodeId: passNodeId,
            player,
            row: null,
            col: null,
            source: mode === "HUMAN_VS_AI" && player === aiColor ? "AI" : "HUMAN",
            board: board.map((r) => r.slice()),
            flipped: [],
            validMoves: normalizeMoves(res.valid_moves),
            nextPlayer,
            moveType: "pass",
            score: countPieces(board),
            phase: "PLAYING",
            winner: null,
          },
        ]);

        setPlayer(nextPlayer);
        setValidMoves(normalizeMoves(res.valid_moves));
        setLastMove(null);
        setFlippedTiles([]);
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

    

  async function handleCellClick(row, col) 
  {
    if (phase !== "PLAYING" || loading) return;
    if (mode === "HUMAN_VS_AI" && player === aiColor) return;
    if (historyViewMode) setHistoryViewMode(false);

    const isValid = validMoves.some((m) => m.row === row && m.col === col);
    if (!isValid) return;

    // If this move already exists in the current branch, just jump to it.
    if (moveTreeRef.current && currentNodeId && moveTreeRef.current.has(currentNodeId)) {
      const parentNode = moveTreeRef.current.get(currentNodeId);
      const children = Array.isArray(parentNode?.children) ? parentNode.children : [];
      const existingChildId = children.find((childId) => {
        const node = moveTreeRef.current.get(childId);
        return node && node.player === player && node.row === row && node.col === col;
      });
      if (existingChildId) {
        jumpToNodeId(existingChildId, false);
        return;
      }
    }

    try {
      setLoading(true);

      // cancel any pending AI request (if user plays while AI was pending)
      if (aiRequestIdRef.current) aiRequestIdRef.current = 0;

      const res = await makeMove({ board, player, row, col });

      setBoard(res.board);

      // --- Move tree: ensure root exists, then record human move as a node ---
      ensureMoveTreeRoot(board);

      const parentIdForHuman =
        currentNodeId && moveTreeRef.current.has(currentNodeId) ? currentNodeId : "root";
      const parentNodeForHuman = moveTreeRef.current.get(parentIdForHuman);

      let createdNodeId = null;

      if (parentNodeForHuman) {
        const nodeId = nextMoveTreeNodeId();
        const node = {
          id: nodeId,
          player,
          row,
          col,
          boardAfter: res.board.map((r) => r.slice()),
          flipped: res.flipped || [],
          nextPlayer: res.game_over ? null : res.next_player,
          validMovesNext: res.game_over ? [] : normalizeMoves(res.valid_moves),
          parentId: parentNodeForHuman.id,
          children: [],
        };
        moveTreeRef.current.set(nodeId, node);
        parentNodeForHuman.children.push(nodeId);
        setCurrentNodeId(nodeId);
        createdNodeId = nodeId;
      }

      // record the human move
      setMoves((m) => [
        ...m,
        {
          nodeId: createdNodeId,
          player,
          row,
          col,
          source: "HUMAN",
          board: res.board.map(r => r.slice()),
          flipped: res.flipped || [],
          validMoves: normalizeMoves(res.valid_moves),
          nextPlayer: res.game_over ? null : res.next_player,
          moveType: "move",
          score: countPieces(res.board),
          phase: res.game_over ? "GAME_OVER" : "PLAYING",
          winner: res.winner ?? null,
        },
      ]);

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
        setFlippedTiles(res.flipped || []);
      }
    } finally {
      setLoading(false);
    }
  }

  function undoMove() {
    // If an AI request is pending, cancel it (keep existing cancellation behavior)
    if (aiRequestIdRef.current) aiRequestIdRef.current = 0;
    if (historyViewMode) setHistoryViewMode(false);

    if (!moveTreeRef.current || !(moveTreeRef.current instanceof Map)) return;
    if (!currentNodeId || !moveTreeRef.current.has(currentNodeId)) return;
    if (currentNodeId === "root") return;

    const undoneNode = moveTreeRef.current.get(currentNodeId);
    const parentId = undoneNode?.parentId;
    if (!parentId || !moveTreeRef.current.has(parentId)) return;

    let targetNodeId = parentId;

    if (mode === "HUMAN_VS_AI") {
      if (undoneNode && undoneNode.player === aiColor) {
        const parentNode = moveTreeRef.current.get(parentId);
        const parentParentId = parentNode?.parentId;
        if (!parentParentId || !moveTreeRef.current.has(parentParentId)) return;
        targetNodeId = parentParentId;
      }
    }

    const targetNode = moveTreeRef.current.get(targetNodeId);
    if (!targetNode) return;

    const restoredBoard = targetNode.boardAfter.map((r) => r.slice());

    setCurrentNodeId(targetNodeId);
    setBoard(restoredBoard);

    // Restore player as the side to move at this position
    const restoredPlayer = targetNode.nextPlayer ?? 1;
    setPlayer(restoredPlayer);

    setLastMove(
      targetNode.row !== null && targetNode.col !== null
        ? { row: targetNode.row, col: targetNode.col }
        : null
    );
    setFlippedTiles(Array.isArray(targetNode.flipped) ? targetNode.flipped : []);

    // If undoing from game over, resume play
    if (phase === "GAME_OVER") {
      setWinner(null);
      setFinalScore(null);
      setPhase("PLAYING");
    }

    // Refresh valid moves for the restored state
    (async () => {
      try {
        const res = await fetchValidMoves({ board: restoredBoard, player: restoredPlayer });
        setValidMoves(normalizeMoves(res.valid_moves));
      } catch (e) {
        setValidMoves([]);
      }
    })();
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
    setFlippedTiles([]);
    setWinner(null);
    setFinalScore(null);
    setMoves([]);
    setHistoryViewMode(false);
    // cancel any pending AI requests
    if (aiRequestIdRef.current) aiRequestIdRef.current = 0;
    setPhase("PLAYING");
    // --- Move tree: initialize root node ---
    moveTreeNodeIdRef.current = 0;
    const rootNode = {
      id: "root",
      player: null,
      row: null,
      col: null,
      boardAfter: initialBoard.map(r => r.slice()),
      flipped: [],
      nextPlayer: 1,
      validMovesNext: initialValidMoves.map((m) => ({ ...m })),
      parentId: null,
      children: [],
    };
    moveTreeRef.current = new Map([["root", rootNode]]);
    setCurrentNodeId("root");
  }

  function resetGame() {
    setLastMove(null);
    setFlippedTiles([]);
    setMoves([]);
    setHistoryViewMode(false);

    if (aiRequestIdRef.current) aiRequestIdRef.current = 0;
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

  function notation(row, col) {
    const files = ["a","b","c","d","e","f","g","h"];
    if (typeof row !== 'number' || typeof col !== 'number') return "";
    return `${files[col] || '?'}${row + 1}`;
  }

  function moveLabelFromNode(node) {
    if (!node) return "";
    if (node.row === null || node.col === null) return "pass";
    return notation(node.row, node.col);
  }

  function moveLabelFromMove(move) {
    if (!move) return "";
    if (move.row === null || move.col === null) return "pass";
    return notation(move.row, move.col);
  }

  function nodeMetaLabel(node) {
    if (!node) return "";
    if (mode !== "HUMAN_VS_AI") return "";
    return node.player === aiColor ? "AI" : "You";
  }

  function getAncestorDistanceMap(nodeId) {
    const distances = new Map();
    if (!nodeId || !moveTreeRef.current || !(moveTreeRef.current instanceof Map)) return distances;
    if (!moveTreeRef.current.has(nodeId)) return distances;

    let currentId = nodeId;
    let distance = 0;
    while (currentId && moveTreeRef.current.has(currentId)) {
      distances.set(currentId, distance);
      const node = moveTreeRef.current.get(currentId);
      if (!node || !node.parentId) break;
      currentId = node.parentId;
      distance += 1;
    }
    return distances;
  }

  function getDistanceToCurrent(nodeId, ancestorDistances) {
    if (!nodeId || !ancestorDistances || ancestorDistances.size === 0) return null;
    if (!moveTreeRef.current || !(moveTreeRef.current instanceof Map)) return null;
    if (!moveTreeRef.current.has(nodeId)) return null;
    if (ancestorDistances.has(nodeId)) return ancestorDistances.get(nodeId);

    let distance = 0;
    let currentId = nodeId;
    while (currentId && moveTreeRef.current.has(currentId)) {
      const node = moveTreeRef.current.get(currentId);
      const parentId = node && node.parentId ? node.parentId : null;
      distance += 1;
      if (parentId && ancestorDistances.has(parentId)) {
        return distance + ancestorDistances.get(parentId);
      }
      currentId = parentId;
    }
    return null;
  }

  function getDistanceClass(nodeId, ancestorDistances) {
    const distance = getDistanceToCurrent(nodeId, ancestorDistances);
    if (distance === 0) return " is-active";
    if (distance === 1) return " is-near";
    return " is-inactive";
  }

  function computeWinnerFromScore(score) {
    if (!score) return null;
    if (score.black > score.white) return 1;
    if (score.white > score.black) return -1;
    return "DRAW";
  }

  function getMoveTreeRowsByPly() {
    if (!moveTreeRef.current || !(moveTreeRef.current instanceof Map)) return [];
    if (!moveTreeRef.current.has("root")) return [];

    const map = moveTreeRef.current;
    /** @type {Array<Array<string|null>>} */
    const lines = [];

    function ensureLine(index) {
      if (!lines[index]) lines[index] = [];
    }

    function clonePrefix(lineIndex, depth) {
      const prefix = (lines[lineIndex] || []).slice(0, depth);
      return prefix;
    }

    function walk(nodeId, depth, lineIndex) {
      const node = map.get(nodeId);
      if (!node) return;

      if (nodeId !== "root") {
        ensureLine(lineIndex);
        lines[lineIndex][depth] = nodeId;
      }

      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length === 0) return;

      const [firstChild, ...restChildren] = children;
      walk(firstChild, depth + 1, lineIndex);

      for (const childId of restChildren) {
        const newLineIndex = lines.length;
        lines[newLineIndex] = clonePrefix(lineIndex, depth + 1);
        walk(childId, depth + 1, newLineIndex);
      }
    }

    walk("root", -1, 0);

    const maxDepth = lines.reduce((max, line) => Math.max(max, line.length), 0);
    /** @type {Array<Array<string|null>>} */
    const rows = [];

    for (let depth = 0; depth < maxDepth; depth += 1) {
      rows[depth] = lines.map((line) => line[depth] ?? null);
    }

    return rows;
  }

  function jumpToNodeId(nodeId, fromHistory = false) {
    if (!nodeId) return;
    if (!moveTreeRef.current || !(moveTreeRef.current instanceof Map)) return;
    if (!moveTreeRef.current.has(nodeId)) return;

    // cancel any pending AI and stop any loading UI
    if (aiRequestIdRef.current) aiRequestIdRef.current = 0;
    setLoading(false);

    const node = moveTreeRef.current.get(nodeId);
    const jumpedBoard = node.boardAfter.map((r) => r.slice());
    const jumpedPlayer = node.nextPlayer ?? 1;
    const storedValidMoves = Array.isArray(node.validMovesNext)
      ? normalizeMoves(node.validMovesNext)
      : null;

    setCurrentNodeId(nodeId);
    setBoard(jumpedBoard);
    setPlayer(jumpedPlayer);
    setHistoryViewMode(fromHistory && mode === "HUMAN_VS_AI");
    setLastMove(
      node.row !== null && node.col !== null ? { row: node.row, col: node.col } : null
    );
    setFlippedTiles(Array.isArray(node.flipped) ? node.flipped : []);

    // Prefer the stored valid moves for this node/branch.
    // Fallback to backend only if missing.
    if (storedValidMoves) {
      setValidMoves(storedValidMoves);
    } else {
      (async () => {
        try {
          const res = await fetchValidMoves({ board: jumpedBoard, player: jumpedPlayer });
          setValidMoves(normalizeMoves(res.valid_moves));
        } catch (e) {
          setValidMoves([]);
        }
      })();
    }

    // Phase: treat nodes with nextPlayer === null as terminal.
    // For other cases, let the existing game-over/pass effect handle it.
    if (node.nextPlayer === null) {
      const score = countPieces(jumpedBoard);
      setFinalScore(score);
      setWinner(computeWinnerFromScore(score));
      setPhase("GAME_OVER");
    } else {
      setWinner(null);
      setFinalScore(null);
      setPhase("PLAYING");
    }
  }

  return (
    <div className="container-fluid min-vh-100 d-flex flex-column align-items-center">
      <h1 className="mt-4">Othello</h1>

      {/* ---------- STATUS BAR ---------- */}
      <div
        className={`status-bar${phase === "SETUP" ? " status-bar--placeholder" : ""}`}
        aria-hidden={phase === "SETUP"}
      >
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
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="reset-btn" onClick={resetGame}>
                Reset
              </button>
              <button
                className="reset-btn"
                onClick={undoMove}
                disabled={currentNodeId === "root"}
                title={currentNodeId !== "root" ? "Undo last move" : "No moves to undo"}
              >
                Undo
              </button>
            </div>
          </div>
      </div>

      <div className={`game-area ${moves.length === 0 ? 'no-history' : ''}`}>
        <div className="board-panel">
          <Board
            board={board}
            validMoves={phase === "PLAYING" ? validMoves : []}
            lastMove={lastMove}
            flippedTiles={flippedTiles}
            onCellClick={handleCellClick}
            currentPlayer={player}
          />

          {loading && phase === "PLAYING" && <p>Thinking…</p>}
        </div>

        {/* ---------- MOVE HISTORY ---------- */}
        <div className={`move-history ${moves.length === 0 ? 'hidden' : ''}`}>
          <div className="move-history-header">
            <h3>Move History</h3>
          </div>
          {(() => {
            const ancestorDistances = getAncestorDistanceMap(currentNodeId);

            if (mode === "HUMAN_VS_AI") {
              const firstMover = moves[0]?.player ?? humanColor;
              const leftColor = firstMover;
              const rightColor = firstMover === 1 ? -1 : 1;
              /** @type {Array<{ index: number, left: any, right: any }>} */
              const turns = [];
              let currentTurn = null;

              for (const move of moves) {
                const isLeftMove = move.player === leftColor;
                const slotTaken = isLeftMove ? currentTurn?.left : currentTurn?.right;

                if (!currentTurn || slotTaken) {
                  currentTurn = { index: turns.length + 1, left: null, right: null };
                  turns.push(currentTurn);
                }

                if (isLeftMove) currentTurn.left = move;
                else currentTurn.right = move;
              }

              if (turns.length === 0) {
                return (
                  <div className="moves-variations-empty">
                    <div className="muted">No moves yet</div>
                  </div>
                );
              }

              return (
                <div className="move-turns" role="table" aria-label="Move turns">
                  {turns.map((turn) => {
                    const isCurrentRow =
                      (turn.left && turn.left.nodeId === currentNodeId) ||
                      (turn.right && turn.right.nodeId === currentNodeId);

                    return (
                    <div
                      key={turn.index}
                      className={`move-turn-row${isCurrentRow ? ' is-current' : ''}`}
                      role="row"
                    >
                      <div className="move-turn-index" role="cell">
                        {turn.index}
                      </div>

                      <div className="move-turn-cells" role="cell">
                        {["left", "right"].map((slot) => {
                          const entry = turn[slot];
                          if (!entry) {
                            return (
                              <div
                                key={`${turn.index}-${slot}-empty`}
                                className="move-turn-cell empty"
                                aria-hidden="true"
                              />
                            );
                          }

                          const label = moveLabelFromMove(entry);
                          const isHovered = entry.nodeId && entry.nodeId === hoveredNodeId;
                          const stateClass = getDistanceClass(entry.nodeId, ancestorDistances);

                          const cellContent = (
                            <>
                              <span className={entry.player === 1 ? 'pill black-pill' : 'pill white-pill'} />
                              <span className="move-turn-text">{label}</span>
                            </>
                          );

                          if (!entry.nodeId) {
                            return (
                              <div key={`${turn.index}-${slot}`} className={`move-turn-cell${stateClass}`}>
                                {cellContent}
                              </div>
                            );
                          }

                          return (
                            <button
                              key={`${turn.index}-${slot}`}
                              type="button"
                              className={`move-turn-cell${stateClass}${isHovered ? ' is-hovered' : ''}`}
                              onClick={() => jumpToNodeId(entry.nodeId, true)}
                              onMouseEnter={() => setHoveredNodeId(entry.nodeId)}
                              onMouseLeave={() => setHoveredNodeId(null)}
                              onFocus={() => setHoveredNodeId(entry.nodeId)}
                              onBlur={() => setHoveredNodeId(null)}
                              title={label}
                            >
                              {cellContent}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              );
            }

            const rows = getMoveTreeRowsByPly();
            const maxPly = rows.length;

            if (maxPly === 0) {
              return (
                <div className="moves-variations-empty">
                  <div className="muted">No moves yet</div>
                </div>
              );
            }

            return (
              <div className="moves-variations" role="table" aria-label="Move variations">
                {Array.from({ length: maxPly }, (_, plyIndex) => {
                  return (
                  <div
                    key={plyIndex}
                    className="moves-variations-row"
                    role="row"
                  >
                    <div className="moves-variations-index" role="cell">
                      {plyIndex + 1}
                    </div>

                    <div className="moves-variations-cells" role="cell">
                      {(rows[plyIndex] || []).map((nodeId, optionIndex) => {
                        if (!nodeId) {
                          return (
                            <div
                              key={`${plyIndex}-${optionIndex}-empty`}
                              className="moves-variations-cell empty"
                              aria-hidden="true"
                            />
                          );
                        }

                        if (!moveTreeRef.current.has(nodeId)) return null;

                        const node = moveTreeRef.current.get(nodeId);
                        const label = moveLabelFromNode(node);
                        const meta = nodeMetaLabel(node);
                        const isHovered = nodeId === hoveredNodeId;
                        const stateClass = getDistanceClass(nodeId, ancestorDistances);
                        const rowNodeIds = rows[plyIndex] || [];
                        const labelCounts = new Map();
                        for (const id of rowNodeIds) {
                          if (!id || !moveTreeRef.current.has(id)) continue;
                          const rowNode = moveTreeRef.current.get(id);
                          const rowLabel = moveLabelFromNode(rowNode);
                          labelCounts.set(rowLabel, (labelCounts.get(rowLabel) || 0) + 1);
                        }
                        const isDuplicateLabel = (labelCounts.get(label) || 0) > 1;

                        return (
                          <button
                            key={`${plyIndex}-${optionIndex}-${nodeId}`}
                            type="button"
                            className={`moves-variations-cell${stateClass}${isHovered ? ' is-hovered' : ''}${isDuplicateLabel ? ' is-duplicate-label' : ''}`}
                            onClick={() => jumpToNodeId(nodeId, true)}
                            onMouseEnter={() => setHoveredNodeId(nodeId)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                            onFocus={() => setHoveredNodeId(nodeId)}
                            onBlur={() => setHoveredNodeId(null)}
                            title={meta ? `${label} (${meta})` : label}
                          >
                            <span className={node.player === 1 ? 'pill black-pill' : 'pill white-pill'} />
                            <span className="moves-variations-text">{label}</span>
                            {meta && <span className="moves-variations-meta">{meta}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

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

              <label className={`color-block ${mode === "HUMAN_VS_AI" ? 'visible' : 'collapsed'}`}>
                <span>Your Color</span>
                <div className="color-choices">
                  <button type="button" className={humanColor===1?"btn color active":"btn color"} onClick={() => setHumanColor(1)}>Black</button>
                  <button type="button" className={humanColor===-1?"btn color active":"btn color"} onClick={() => setHumanColor(-1)}>White</button>
                </div>
              </label>
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
