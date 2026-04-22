# SyncBoard — Real-time Collaborative Whiteboard

A production-grade collaborative whiteboard with real-time drawing synchronization, live cursors, and WebRTC video calling.

## Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **Real-time:** Socket.io
- **Video:** WebRTC (Phase 3)
- **Database:** MongoDB (future)

## Getting Started

### 1. Start the Server

```bash
cd server
npm install
npm run dev
```

Server runs on `http://localhost:3001`.

### 2. Start the Client

```bash
cd client
npm install
npm run dev
```

Client runs on `http://localhost:5173`.

### 3. Open in Browser

Navigate to `http://localhost:5173`, create a room, and share the Room ID with others.

## Project Structure

```
├── server/
│   └── src/
│       ├── server.js          # Entry point
│       ├── app.js             # Express factory
│       ├── config/            # Environment config
│       ├── socket/            # Socket.io handlers + RoomManager
│       ├── routes/            # REST endpoints
│       └── utils/             # Logger
│
├── client/
│   └── src/
│       ├── lib/               # Socket singleton
│       ├── context/           # React Context (Socket)
│       ├── hooks/             # Custom hooks
│       ├── components/        # Reusable UI components
│       └── pages/             # Home + Room pages
```

## Architecture

- **Event-driven:** Socket.io handles all real-time communication
- **Delta updates:** Only drawing changes are sent, never the full canvas
- **Volatile emissions:** Cursor and draw:move events use volatile for low latency
- **Room management:** In-memory RoomManager with auto-create/cleanup
