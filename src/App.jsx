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
  const [loading, setLoading] = useState(false);
  const [flippedTiles, setFlippedTiles] = useState([]);
  const [historyViewMode, setHistoryViewMode] = useState(false);

  const [mode, setMode] = useState("HUMAN_VS_AI");
  const [humanColor, setHumanColor] = useState(1);
  const [difficulty, setDifficulty] = useState("medium"); // easy, medium, hard, expert

  const [phase, setPhase] = useState("SETUP"); // SETUP | PLAYING | GAME_OVER
  const [winner, setWinner] = useState(null);
  const [finalScore, setFinalScore] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const moveSoundRef = useRef(null);

  // Move tree state
  const moveTreeRef = useRef(new Map());
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const moveTreeNodeIdRef = useRef(0);
  const aiColor = mode === "HUMAN_VS_AI" ? -humanColor : null;
  const liveScore = countPieces(board);
  const aiRequestIdRef = useRef(0);

  useEffect(() => {
    const audio = new Audio("/move-self.mp3");
    audio.preload = "auto";
    audio.volume = 0.6;
    moveSoundRef.current = audio;
  }, []);

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

        const res = await makeAIMove({ board, player, difficulty });

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
        // record AI move if provided - but don't add to moves array
        // if (res.move && typeof res.move.row === "number") {
        //   setMoves((m) => [
        //     ...m,
        //     {
        //       nodeId: createdNodeId,
        //       player,
        //       row: res.move.row,
        //       col: res.move.col,
        //       source: "AI",
        //       board: res.board.map(r => r.slice()),
        //       flipped: res.flipped || [],
        //       validMoves: normalizeMoves(res.valid_moves),
        //       nextPlayer: res.game_over ? null : res.next_player,
        //       moveType: "move",
        //       score: countPieces(res.board),
        //       phase: res.game_over ? "GAME_OVER" : "PLAYING",
        //       winner: res.winner ?? null,
        //     },
        //   ]);
        // } else {
        //   // AI pass
        //   setMoves((m) => [
        //     ...m,
        //     {
        //       nodeId: createdNodeId,
        //       player,
        //       row: null,
        //       col: null,
        //       source: "AI",
        //       board: res.board.map(r => r.slice()),
        //       flipped: [],
        //       validMoves: normalizeMoves(res.valid_moves),
        //       nextPlayer: res.game_over ? null : res.next_player,
        //       moveType: "pass",
        //       score: countPieces(res.board),
        //       phase: res.game_over ? "GAME_OVER" : "PLAYING",
        //       winner: res.winner ?? null,
        //     },
        //   ]);
        // }

        if (res.game_over) {
          const score = countPieces(res.board);
          setFinalScore(score);

          if (res.winner === 1) setWinner(1);
          else if (res.winner === -1) setWinner(-1);
          else setWinner("DRAW");

          setPhase("GAME_OVER");
          
          // Play game over sound
          if (mode === "HUMAN_VS_AI") {
            playSound(res.winner === humanColor ? 'win' : 'lose');
          } else {
            playSound('gameOver');
          }
        } else {
          setPlayer(res.next_player);
          setValidMoves(normalizeMoves(res.valid_moves));
          setLastMove(res.move || null);
          setFlippedTiles(res.flipped || []);
          
          // Play AI move sound
          if (res.move && typeof res.move.row === "number") {
            if (res.flipped && res.flipped.length > 0) {
              playSound('capture');
            } else {
              playSound('move');
            }
          } else {
            playSound('pass');
          }
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

        // Don't add to moves array anymore
        // setMoves((m) => [
        //   ...m,
        //   {
        //     nodeId: passNodeId,
        //     player,
        //     row: null,
        //     col: null,
        //     source: mode === "HUMAN_VS_AI" && player === aiColor ? "AI" : "HUMAN",
        //     board: board.map((r) => r.slice()),
        //     flipped: [],
        //     validMoves: normalizeMoves(res.valid_moves),
        //     nextPlayer,
        //     moveType: "pass",
        //     score: countPieces(board),
        //     phase: "PLAYING",
        //     winner: null,
        //   },
        // ]);

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
      const currentNode = moveTreeRef.current.get(currentNodeId);
      const children = Array.isArray(currentNode?.children) ? currentNode.children : [];
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

      const parentIdForHuman = currentNodeId && moveTreeRef.current.has(currentNodeId) ? currentNodeId : "root";
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

      // record the human move - but don't add to moves array, it's only for old UI
      // setMoves((m) => [
      //   ...m,
      //   {
      //     nodeId: createdNodeId,
      //     player,
      //     row,
      //     col,
      //     source: "HUMAN",
      //     board: res.board.map(r => r.slice()),
      //     flipped: res.flipped || [],
      //     validMoves: normalizeMoves(res.valid_moves),
      //     nextPlayer: res.game_over ? null : res.next_player,
      //     moveType: "move",
      //     score: countPieces(res.board),
      //     phase: res.game_over ? "GAME_OVER" : "PLAYING",
      //     winner: res.winner ?? null,
      //   },
      // ]);

      if (res.game_over) {
        const score = countPieces(res.board);
        setFinalScore(score);

        if (res.winner === 1) setWinner(1);
        else if (res.winner === -1) setWinner(-1);
        else setWinner("DRAW");

        setPhase("GAME_OVER");
        
        // Play game over sound
        if (mode === "HUMAN_VS_AI") {
          playSound(res.winner === humanColor ? 'win' : 'lose');
        } else {
          playSound('gameOver');
        }
      } else {
        setPlayer(res.next_player);
        setValidMoves(normalizeMoves(res.valid_moves));
        setLastMove({ row, col });
        setFlippedTiles(res.flipped || []);
        
        // Play move sound
        if (res.flipped && res.flipped.length > 0) {
          playSound('capture');
        } else {
          playSound('move');
        }
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
    setHistoryViewMode(false);

    if (aiRequestIdRef.current) aiRequestIdRef.current = 0;
    setPhase("SETUP");
  }

  function gameOverMessage() {
    if (winner === "DRAW") return "🤝 It’s a Draw";

    if (mode === "HUMAN_VS_AI") {
      return winner === humanColor
        ? "You Won!"
        : "AI Won";
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

  function computeWinnerFromScore(score) {
    if (!score) return null;
    if (score.black > score.white) return 1;
    if (score.white > score.black) return -1;
    return "DRAW";
  }

  function goToPreviousMove() {
    if (!currentNodeId || !moveTreeRef.current.has(currentNodeId)) return;
    const currentNode = moveTreeRef.current.get(currentNodeId);
    if (currentNode.parentId && moveTreeRef.current.has(currentNode.parentId)) {
      jumpToNodeId(currentNode.parentId, true);
    }
  }

  function goToNextMove() {
    if (!currentNodeId || !moveTreeRef.current.has(currentNodeId)) return;
    const currentNode = moveTreeRef.current.get(currentNodeId);
    if (currentNode.children.length > 0) {
      // Go to first child (main line)
      jumpToNodeId(currentNode.children[0], true);
    }
  }

  function goToParentMove() {
    goToPreviousMove(); // Same as previous move
  }

  function goToFirstChild() {
    if (!currentNodeId || !moveTreeRef.current.has(currentNodeId)) return;
    const currentNode = moveTreeRef.current.get(currentNodeId);
    if (currentNode.children.length > 1) {
      // Go to second child (first branch)
      jumpToNodeId(currentNode.children[1], true);
    }
  }

  function goToLastMove() {
    if (!moveTreeRef.current.has("root")) return;
    
    // Find the deepest node in the main line
    let currentId = "root";
    while (true) {
      const node = moveTreeRef.current.get(currentId);
      if (!node || node.children.length === 0) break;
      currentId = node.children[0]; // Follow main line
    }
    
    if (currentId !== "root") {
      jumpToNodeId(currentId, true);
    }
  }

  // Save/Load game functionality
  function saveGame() {
    try {
      const gameData = {
        moveTree: Array.from(moveTreeRef.current.entries()),
        currentNodeId: currentNodeId,
        gameInfo: {
          mode: mode,
          humanColor: humanColor,
          difficulty: difficulty,
          phase: phase,
          winner: winner,
          finalScore: finalScore,
          timestamp: new Date().toISOString(),
          version: "1.0"
        }
      };
      
      const gameId = `othello-game-${Date.now()}`;
      localStorage.setItem(gameId, JSON.stringify(gameData));
      
      // Also save to a list of saved games
      const savedGames = JSON.parse(localStorage.getItem('othello-saved-games') || '[]');
      savedGames.push({
        id: gameId,
        timestamp: gameData.gameInfo.timestamp,
        mode: gameData.gameInfo.mode,
        phase: gameData.gameInfo.phase,
        moveCount: gameData.moveTree.length - 1 // Exclude root
      });
      localStorage.setItem('othello-saved-games', JSON.stringify(savedGames));
      
      // Show success message (you can replace with a toast notification)
      alert('Game saved successfully!');
      
      return gameId;
    } catch (error) {
      console.error('Failed to save game:', error);
      alert('Failed to save game. Please try again.');
    }
  }

  function loadGame(gameId) {
    try {
      const gameData = JSON.parse(localStorage.getItem(gameId));
      if (!gameData) {
        alert('Game not found!');
        return;
      }

      // Restore move tree
      moveTreeRef.current = new Map(gameData.moveTree);
      
      // Restore game state
      setCurrentNodeId(gameData.currentNodeId);
      setMode(gameData.gameInfo.mode);
      setHumanColor(gameData.gameInfo.humanColor);
      setDifficulty(gameData.gameInfo.difficulty || "medium");
      setPhase(gameData.gameInfo.phase);
      setWinner(gameData.gameInfo.winner);
      setFinalScore(gameData.gameInfo.finalScore);
      
      // Jump to the current position to restore board state
      if (gameData.currentNodeId && moveTreeRef.current.has(gameData.currentNodeId)) {
        jumpToNodeId(gameData.currentNodeId, false);
      }
      
      alert('Game loaded successfully!');
    } catch (error) {
      console.error('Failed to load game:', error);
      alert('Failed to load game. The save file may be corrupted.');
    }
  }

  function getSavedGames() {
    try {
      return JSON.parse(localStorage.getItem('othello-saved-games') || '[]');
    } catch (error) {
      console.error('Failed to get saved games:', error);
      return [];
    }
  }

  function deleteSavedGame(gameId) {
    try {
      localStorage.removeItem(gameId);
      const savedGames = getSavedGames().filter(game => game.id !== gameId);
      localStorage.setItem('othello-saved-games', JSON.stringify(savedGames));
    } catch (error) {
      console.error('Failed to delete saved game:', error);
    }
  }

  // Sound effects
  const playSound = (soundType) => {
    try {
      if (soundType === "move" || soundType === "capture" || soundType === "pass") {
        const moveAudio = moveSoundRef.current;
        if (moveAudio) {
          moveAudio.currentTime = 0;
          const playPromise = moveAudio.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
          return;
        }
      }

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Chess-like sound effects
      const sounds = {
        move: { 
          frequencies: [800, 600], 
          duration: 0.08, 
          type: 'sine',
          envelope: 'quick'
        },
        capture: { 
          frequencies: [1200, 800, 400], 
          duration: 0.12, 
          type: 'square',
          envelope: 'sharp'
        },
        pass: { 
          frequencies: [400, 300], 
          duration: 0.15, 
          type: 'triangle',
          envelope: 'soft'
        },
        gameOver: { 
          frequencies: [523, 659, 784], // C-E-G chord
          duration: 0.6, 
          type: 'sine',
          envelope: 'long'
        },
        win: { 
          frequencies: [523, 659, 784, 1047], // C-E-G-C chord
          duration: 0.8, 
          type: 'sine',
          envelope: 'celebration'
        },
        lose: { 
          frequencies: [392, 311, 262], // G-Eb-C descending
          duration: 0.7, 
          type: 'triangle',
          envelope: 'sad'
        }
      };
      
      const sound = sounds[soundType];
      if (!sound) return;
      
      // Create multiple oscillators for chord-like sounds
      sound.frequencies.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = sound.type;
        
        // Different envelope shapes for different sounds
        const startTime = audioContext.currentTime + (index * 0.02); // Slight delay for chord effect
        const volume = 0.05 / sound.frequencies.length; // Reduce volume for multiple oscillators
        
        switch(sound.envelope) {
          case 'quick':
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + sound.duration);
            break;
          case 'sharp':
            gainNode.gain.setValueAtTime(volume * 1.5, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + sound.duration);
            break;
          case 'soft':
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume * 0.8, startTime + 0.03);
            gainNode.gain.linearRampToValueAtTime(0.001, startTime + sound.duration);
            break;
          case 'long':
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.1);
            gainNode.gain.linearRampToValueAtTime(volume * 0.7, startTime + sound.duration * 0.7);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + sound.duration);
            break;
          case 'celebration':
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(volume * 0.8, startTime + sound.duration * 0.8);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + sound.duration);
            break;
          case 'sad':
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume * 0.9, startTime + 0.1);
            gainNode.gain.linearRampToValueAtTime(0.001, startTime + sound.duration);
            break;
        }
        
        oscillator.start(startTime);
        oscillator.stop(startTime + sound.duration);
      });
      
    } catch (error) {
      // Silently fail if audio is not supported
      console.log('Audio not supported or failed:', error);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only handle keyboard navigation when not in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPreviousMove();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNextMove();
          break;
        case 'ArrowUp':
          e.preventDefault();
          goToParentMove();
          break;
        case 'ArrowDown':
          e.preventDefault();
          goToFirstChild();
          break;
        case 'Home':
          e.preventDefault();
          jumpToNodeId("root", true);
          break;
        case 'End':
          e.preventDefault();
          goToLastMove();
          break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            saveGame();
          }
          break;
        case 'l':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const savedGames = getSavedGames();
            if (savedGames.length > 0) {
              const mostRecent = savedGames[savedGames.length - 1];
              if (confirm(`Load game from ${new Date(mostRecent.timestamp).toLocaleString()}?`)) {
                loadGame(mostRecent.id);
              }
            } else {
              alert('No saved games found!');
            }
          }
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            undoMove();
          }
          break;
        case 'n':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (confirm('Start a new game? Current progress will be lost.')) {
              resetGame();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentNodeId]);

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
        <div className="status-content">
          <div className="game-info">
            <div className="mode-display">
              <span className="mode-text">{mode === "HUMAN_VS_AI" ? "Human vs AI" : "Human vs Human"}</span>
            </div>
            
            <div className="turn-display">
              <span className="turn-label">Turn:</span>
              <div className="current-player">
                <span className={`player-dot ${player === 1 ? 'black' : 'white'}`} />
                <span className="player-name">{colorName(player)}</span>
              </div>
            </div>
          </div>

          <div className="score-display">
            <div className="score-item black-score">
              <span className="score-dot black" />
              <span className="score-label">{scoreLabel(1)}</span>
              <span className="score-value">{liveScore.black}</span>
            </div>
            
            <div className="score-separator">vs</div>
            
            <div className="score-item white-score">
              <span className="score-dot white" />
              <span className="score-label">{scoreLabel(-1)}</span>
              <span className="score-value">{liveScore.white}</span>
            </div>
          </div>

          <div className="game-controls">
            <div className="control-group">
              <button className="control-btn save-btn" onClick={saveGame} title="Save Game (Ctrl+S)">
                <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 3v10" />
                  <path d="M8 9l4 4 4-4" />
                  <path d="M5 17v3h14v-3" />
                </svg>
                <span className="btn-text">Save</span>
              </button>
              <button className="control-btn load-btn" onClick={() => {
                const savedGames = getSavedGames();
                if (savedGames.length === 0) {
                  alert('No saved games found!');
                  return;
                }
                
                const mostRecent = savedGames[savedGames.length - 1];
                if (confirm(`Load game from ${new Date(mostRecent.timestamp).toLocaleString()}?`)) {
                  loadGame(mostRecent.id);
                }
              }} title="Load Game (Ctrl+L)">
                <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 21V11" />
                  <path d="M8 15l4-4 4 4" />
                  <path d="M5 7v-3h14v3" />
                </svg>
                <span className="btn-text">Load</span>
              </button>
            </div>
            
            <div className="control-group">
              <button
                className="control-btn undo-btn"
                onClick={undoMove}
                disabled={currentNodeId === "root"}
                title={currentNodeId !== "root" ? "Undo Move (Ctrl+Z)" : "No moves to undo"}
              >
                <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M9 7l-4 4 4 4" />
                  <path d="M5 11h8a6 6 0 1 1 0 12H9" />
                </svg>
                <span className="btn-text">Undo</span>
              </button>
              <button className="control-btn reset-btn" onClick={resetGame} title="New Game (Ctrl+N)">
                <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M20 12a8 8 0 1 1-2.4-5.7" />
                  <path d="M20 4v6h-6" />
                </svg>
                <span className="btn-text">Reset</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`game-area ${!moveTreeRef.current || !moveTreeRef.current.has("root") || moveTreeRef.current.get("root").children.length === 0 ? 'no-history' : ''}`}>
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
        <div className={`move-history ${!moveTreeRef.current || !moveTreeRef.current.has("root") || moveTreeRef.current.get("root").children.length === 0 ? 'hidden' : ''}`}>
          <div className="move-history-header">
            <h3>Move History</h3>
            <div className="keyboard-shortcuts">
              <small>Use ← → ↑ ↓ keys to navigate</small>
            </div>
            {currentNodeId && currentNodeId !== "root" && (
              <div className="current-path">
                {(() => {
                  const path = [];
                  let nodeId = currentNodeId;
                  while (nodeId && moveTreeRef.current.has(nodeId)) {
                    const node = moveTreeRef.current.get(nodeId);
                    if (node.id !== "root") {
                      path.unshift(node);
                    }
                    nodeId = node.parentId;
                  }
                  return (
                    <span className="path-indicator">
                      Move {Math.ceil(path.length / 2)} 
                      {path.length > 0 && ` • ${colorName(path[path.length - 1].player)}`}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
          {(() => {
            if (!moveTreeRef.current || !moveTreeRef.current.has("root")) {
              return (
                <div className="move-tree-empty">
                  <div className="muted">No moves yet</div>
                </div>
              );
            }

            const rootNode = moveTreeRef.current.get("root");
            if (!rootNode || rootNode.children.length === 0) {
              return (
                <div className="move-tree-empty">
                  <div className="muted">No moves yet</div>
                </div>
              );
            }

            function renderMoveTree(nodeId, depth = 0, isBranch = false) {
              if (!nodeId || !moveTreeRef.current.has(nodeId)) return null;
              
              const node = moveTreeRef.current.get(nodeId);
              if (!node || node.id === "root") {
                // Render root's children - all are main line initially
                return (
                  <div className="move-tree-root">
                    {node.children.map((childId) => 
                      renderMoveTree(childId, 0, false)
                    )}
                  </div>
                );
              }

              const isActive = currentNodeId === node.id;
              const isHovered = hoveredNodeId === node.id;
              const hasMultipleChildren = node.children.length > 1;
              const moveLabel = moveLabelFromNode(node);
              const isPass = node.row === null || node.col === null;
              
              // Calculate sequential move number for Othello
              let moveNumber = 0;
              let currentId = node.id;
              while (currentId && moveTreeRef.current.has(currentId)) {
                const currentNode = moveTreeRef.current.get(currentId);
                if (currentNode.parentId) {
                  moveNumber++;
                }
                currentId = currentNode.parentId;
              }
              const displayMoveNumber = moveNumber;

              const result = [];

              // Render this move
              result.push(
                <div key={node.id} className={`move-tree-node depth-${depth} ${isBranch ? 'branch-line' : 'main-line'}`}>
                  <div className="move-node-content">
                    {depth > 0 && <div className="branch-connector" />}
                    
                    <button
                      type="button"
                      className={`move-btn ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''} ${isPass ? 'pass-move' : ''}`}
                      onClick={() => jumpToNodeId(node.id, true)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      title={isPass ? `${colorName(node.player)} passes` : `${colorName(node.player)} plays ${moveLabel}`}
                    >
                      <span className="move-number">{displayMoveNumber}.</span>
                      <span className={`player-indicator ${node.player === 1 ? 'black' : 'white'}`} />
                      <span className="move-text">
                        {isPass ? 'pass' : moveLabel}
                      </span>
                      {hasMultipleChildren && (
                        <span className="branch-indicator" title={`${node.children.length} variations`}>
                          ({node.children.length})
                        </span>
                      )}
                      {/* Show piece count change */}
                      {!isPass && node.flipped && node.flipped.length > 0 && (
                        <span className="capture-count" title={`Flipped ${node.flipped.length} pieces`}>
                          +{node.flipped.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              );

              // If this node has children, we need to handle them specially
              if (node.children.length > 0) {
                // Sort children by creation time to maintain order
                const sortedChildren = [...node.children].sort((a, b) => {
                  const nodeA = moveTreeRef.current.get(a);
                  const nodeB = moveTreeRef.current.get(b);
                  // Extract numeric part from node IDs (n1, n2, etc.)
                  const idA = parseInt(nodeA.id.substring(1));
                  const idB = parseInt(nodeB.id.substring(1));
                  return idA - idB;
                });

                // First child continues the main line
                const [mainChild, ...branchChildren] = sortedChildren;
                
                // Render branch children first (they appear right after this move)
                branchChildren.forEach(childId => {
                  result.push(renderMoveTree(childId, depth + 1, true));
                });
                
                // Then render main line continuation
                if (mainChild) {
                  result.push(renderMoveTree(mainChild, depth, false));
                }
              }

              return result;
            }

            return (
              <div className="move-tree-container">
                {renderMoveTree("root")}
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

              <label className={`difficulty-block ${mode === "HUMAN_VS_AI" ? 'visible' : 'collapsed'}`}>
                <span>AI Difficulty</span>
                <div className="difficulty-choices">
                  <button type="button" className={difficulty==="easy"?"btn difficulty active":"btn difficulty"} onClick={() => setDifficulty("easy")}>Easy</button>
                  <button type="button" className={difficulty==="medium"?"btn difficulty active":"btn difficulty"} onClick={() => setDifficulty("medium")}>Medium</button>
                  <button type="button" className={difficulty==="hard"?"btn difficulty active":"btn difficulty"} onClick={() => setDifficulty("hard")}>Hard</button>
                  <button type="button" className={difficulty==="expert"?"btn difficulty active":"btn difficulty"} onClick={() => setDifficulty("expert")}>Expert</button>
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
