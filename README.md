# Othello Frontend

A React + Vite UI for playing Othello against another human or a simple AI. Includes a move tree, undo, and a clear setup flow.

## Features
- Human vs AI or Human vs Human modes
- Move validation and highlights
- Move history with branching (jump to any variation)
- Undo with accurate board restoration
- Game over summary with final score

## Tech Stack
- React 19 + Vite
- Bootstrap 5

## Prerequisites
- Node.js 18+ and npm

## Quickstart
```bash
cd othello-frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

## Backend Connection
The app expects the API at `http://127.0.0.1:8000`. To point elsewhere, edit `API_URL` in `src/api.js`.

## Scripts
- `npm run dev` - Start the dev server
- `npm run build` - Production build
- `npm run preview` - Preview the build locally
- `npm run lint` - Lint the codebase

## Project Layout
- `src/App.jsx` - Game flow, move history, and UI state
- `src/Board.jsx` - Board rendering and interactions
- `src/api.js` - API client for the FastAPI backend
