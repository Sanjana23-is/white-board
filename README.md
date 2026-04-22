# 🎨 SyncBoard — Real-Time Collaborative Whiteboard

> A production-grade, full-stack collaborative whiteboard application where multiple users can draw, communicate, and collaborate together in real time — complete with video calling, sticky notes, and live cursor tracking.

---

## 📌 Table of Contents

1. [What is SyncBoard?](#-what-is-syncboard)
2. [Live Demo](#-live-demo)
3. [Features](#-features)
4. [Tech Stack](#-tech-stack)
5. [Project Architecture](#-project-architecture)
6. [Project Structure](#-project-structure)
7. [How to Run Locally](#-how-to-run-locally)
8. [How to Use](#-how-to-use)
9. [Socket.io Events Reference](#-socketio-events-reference)
10. [Performance Optimizations](#-performance-optimizations)
11. [Known Limitations](#-known-limitations)

---

## 🧠 What is SyncBoard?

**SyncBoard** is a real-time collaborative whiteboard built with the **MERN stack** (without MongoDB — using in-memory storage) and **Socket.io** for low-latency communication.

Think of it like a shared digital whiteboard where:
- Multiple people join the **same room** using a Room ID
- Everything drawn by one person **instantly appears** on everyone else's screen
- You can see **where everyone's cursor is** in real time
- You can **video call** each other directly in the browser
- You can **chat**, add **sticky notes**, and **undo** each other's mistakes

This is built entirely with **React + Node.js + Socket.io + WebRTC** — no third-party whiteboard SDKs.

---

## 🚀 Live Demo

To run it yourself (see [How to Run Locally](#-how-to-run-locally)):

```
Frontend: http://localhost:5174
Backend:  http://localhost:3001
```

Open **two browser tabs**, join the **same Room ID** with different usernames, and start drawing!

---

## ✨ Features

### 🎨 Drawing Tools
| Tool | Description |
|------|-------------|
| ✏️ **Pen** | Freehand drawing with smooth lines |
| ⬜ **Eraser** | Erase specific parts of the canvas |
| ▭ **Rectangle** | Click and drag to draw a rectangle |
| ╱ **Line** | Click and drag to draw a straight line |
| 🎨 **Color Palette** | 10 color choices |
| 🖊️ **Brush Size** | 4 size options (2px, 4px, 8px, 14px) |

### 🔄 Canvas Actions
| Action | Shortcut | Description |
|--------|----------|-------------|
| **Undo** | `Ctrl+Z` | Remove your last stroke (synced to all users) |
| **Redo** | `Ctrl+Y` | Restore last undone stroke (synced to all users) |
| **Clear** | Button | Wipe the entire canvas for everyone |
| **Export PNG** | Button | Download canvas as lossless PNG image |
| **Export PDF** | Button | Download canvas as PDF document |

### 👥 Real-Time Collaboration
- **Live drawing sync** — see others draw stroke by stroke as it happens
- **Live cursor tracking** — see everyone's cursor with their username
- **Canvas history** — join a room mid-session and instantly see everything drawn so far
- **Undo/Redo** synced across all users simultaneously

### 💬 Communication
- **Chat panel** — send and receive text messages in the room with timestamps
- **Unread badge** — red badge on chat button shows unread message count
- **Join/Leave notifications** — toast pop-ups when users enter or leave

### 📹 WebRTC Video Calling
- **Peer-to-peer video** — direct browser-to-browser, no server processing
- **2–4 users** supported simultaneously
- **Start/Stop toggle** — opt-in to video, it's not forced
- Uses **STUN servers** (Google's public STUN) for NAT traversal

### 🗒️ Sticky Notes
- **Create notes** — click the Note button to add a note at canvas center
- **Drag to move** — grab the header bar and drag anywhere
- **Edit text** — click inside the note and type
- **Delete** — click the ✕ button
- **5 pastel colors** — randomly assigned on creation
- **Real-time sync** — all note actions synced to all users

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with hooks |
| **Vite** | Ultra-fast development bundler |
| **HTML5 Canvas API** | Drawing engine — no external canvas library |
| **Socket.io Client** | Real-time communication with server |
| **WebRTC** | Peer-to-peer video calling |
| **React Router v6** | Client-side routing (Home → Room) |
| **jsPDF** | PDF export (dynamically imported) |
| **Vanilla CSS** | All styling — no Tailwind or CSS frameworks |

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** | JavaScript runtime |
| **Express.js** | HTTP server framework |
| **Socket.io** | Real-time bidirectional events |
| **In-memory storage** | Room state stored in `Map` objects (no database) |

### Architecture Pattern
```
Client (React)  ←──Socket.io──→  Server (Node.js)
     ↑                                    ↑
  Canvas API                         RoomManager
  WebRTC (P2P) ←────────────────→  (signaling only)
```

---

## 🏗 Project Architecture

### How Real-Time Drawing Works

```
User A moves mouse
    ↓
mousemove event fires (up to 200/sec)
    ↓
Distance + time gate filters → only emits if ≥3px moved AND ≥14ms elapsed (~70fps max)
    ↓
socket.volatile.emit('draw:move', {x, y})  ← "volatile" = drop if network busy
    ↓
Server receives → broadcasts to all other users in room
    ↓
User B's socket receives draw:move
    ↓
Event pushed to remoteQueue (not rendered yet)
    ↓
requestAnimationFrame fires → flushRemoteQueue() renders all pending segments
    ↓
User B sees the stroke (max ~16ms latency from input to render)
```

### How Undo/Redo Works (Stack-Based)

```
Server maintains: canvasHistory[] for each room
                  redoStack[] for each user

User A draws Stroke 1 → history: [S1]      redoStack: []
User A draws Stroke 2 → history: [S1, S2]  redoStack: []

User A presses Ctrl+Z (undo):
  Server removes S2 from history → history: [S1]
  Server pushes S2 to A's redoStack → redoStack: [S2]
  Server broadcasts canvas:history-update to ALL users
  ALL users: clearRect() + replay [S1] → S2 disappears everywhere ✅

User A presses Ctrl+Y (redo):
  Server pops S2 from redoStack → redoStack: []
  Server pushes S2 back to history → history: [S1, S2]
  Server broadcasts canvas:history-update
  ALL users: clearRect() + replay [S1, S2] → S2 reappears ✅
```

**Key rule:** Each user can only undo/redo **their own strokes**. User A cannot undo User B's drawing.

### How WebRTC Video Works (Mesh)

```
User A is alone in room. User B clicks "Start Video":
  1. B gets local camera stream
  2. B emits webrtc:join-video to server
  3. Server tells B who else has video: [A's socketId]  ← A already has video
  4. B creates RTCPeerConnection(A) and sends OFFER to A (via server relay)
  5. A receives OFFER, creates ANSWER, sends back (via server relay)
  6. Both exchange ICE candidates (network path info)
  7. WebRTC establishes P2P connection — video streams directly browser-to-browser
  8. Server is no longer involved in the video data
```

### How Canvas History Works for Late Joiners

```
User A and B have been drawing for 10 minutes.
User C joins the room:
  1. Server sends room:joined event with full canvasHistory[]
  2. C's Whiteboard component calls replayHistory(canvasHistory)
  3. All strokes replayed synchronously on C's canvas
  4. C instantly sees everything drawn so far
```

---

## 📁 Project Structure

```
white_board/
├── client/                          # React frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── Whiteboard.jsx       # Main canvas component + toolbar
│       │   ├── Whiteboard.css
│       │   ├── RemoteCursors.jsx    # Shows other users' cursors
│       │   ├── StickyNotes.jsx      # Draggable note overlay
│       │   ├── StickyNotes.css
│       │   ├── VideoPanel.jsx       # Floating video call panel
│       │   ├── VideoPanel.css
│       │   ├── ChatPanel.jsx        # Floating chat panel
│       │   ├── ChatPanel.css
│       │   ├── ConnectionStatus.jsx # Socket connection indicator
│       │   └── Toast.jsx            # Join/leave notifications
│       ├── hooks/
│       │   ├── useDrawing.js        # Drawing engine + socket sync
│       │   ├── useCursor.js         # Cursor tracking + sync
│       │   ├── useRoom.js           # Room membership management
│       │   ├── useWebRTC.js         # WebRTC peer connections
│       │   ├── useNotes.js          # Sticky notes state + sync
│       │   ├── useChat.js           # Chat messages state + sync
│       │   └── useSocket.js         # Socket.io connection
│       ├── pages/
│       │   ├── Home.jsx             # Landing page (join/create room)
│       │   ├── Home.css
│       │   ├── Room.jsx             # Main whiteboard page
│       │   └── Room.css
│       └── context/
│           └── SocketContext.jsx    # Socket instance shared via Context API
│
└── server/                          # Node.js backend
    └── src/
        ├── server.js                # Express + Socket.io setup
        └── socket/
            ├── handlers.js          # All socket event handlers
            └── RoomManager.js       # In-memory room state manager
```

---

## ⚙️ How to Run Locally

### Prerequisites
- **Node.js** v18 or above
- **npm** v9 or above

### Step 1 — Clone the repository
```bash
git clone https://github.com/Sanjana23-is/white-board.git
cd white-board
```

### Step 2 — Install dependencies
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Step 3 — Start the backend server
```bash
cd server
npm run dev
# Server starts at http://localhost:3001
```

### Step 4 — Start the frontend (in a new terminal)
```bash
cd client
npm run dev
# Frontend starts at http://localhost:5174
```

### Step 5 — Test with multiple users
Open **two browser tabs** at `http://localhost:5174`:
- Tab 1: Enter username `Alice`, Room ID `room123` → Join
- Tab 2: Enter username `Bob`, Room ID `room123` → Join
- Draw in one tab — it should instantly appear in the other!

---

## 🖥 How to Use

### Creating / Joining a Room
1. Go to `http://localhost:5174`
2. Enter your **username**
3. Either:
   - Click **Create New Room** → generates a unique Room ID automatically
   - Type a **Room ID** and click **Join Room** → joins an existing room
4. Share the Room ID with friends so they can join the same room

### Drawing
| Tool | How to Use |
|------|-----------|
| ✏️ Pen | Select Pen mode → click and drag on canvas |
| ⬜ Eraser | Select Eraser → click and drag over strokes to erase |
| ▭ Rectangle | Select Rect → click and drag to define rectangle corners |
| ╱ Line | Select Line → click start point, drag to end point |

### Undo / Redo
- `Ctrl+Z` (or `⌘+Z` on Mac) → Undo your last stroke
- `Ctrl+Y` (or `Ctrl+Shift+Z`) → Redo your last undone stroke
- Only undoes **your own** strokes, not others'

### Chat
1. Click the **💬 Chat** button in the left sidebar
2. A chat panel appears at the bottom-left
3. Type your message and press **Send** or hit **Enter**
4. Red badge on the Chat button shows unread count when panel is closed

### Sticky Notes
1. Click the **Note** button in the toolbar
2. A sticky note appears at the canvas center
3. **Drag** the header bar (⠿) to move it
4. **Click** the body to type text
5. **✕** to delete

### Video Call
1. Click **Start Video** in the video panel (bottom-right)
2. Browser will ask for camera/microphone permission — allow it
3. Other users in the room do the same to connect
4. Video streams are **peer-to-peer** (direct browser connection)

### Export
- **PNG** button → Downloads canvas as `syncboard-[timestamp].png`
- **PDF** button → Downloads canvas as `syncboard-[timestamp].pdf`

---

## 📡 Socket.io Events Reference

### Room Events
| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `room:join` | Client → Server | `{roomId, username}` | Join a room |
| `room:joined` | Server → Client | `{roomId, user, users, canvasHistory, notes}` | Confirmation + initial state |
| `room:user-joined` | Server → All | `{user}` | Broadcast when someone joins |
| `room:user-left` | Server → All | `{userId, username, users}` | Broadcast when someone leaves |
| `room:message` | Both ways | `{message}` / `{userId, username, message, timestamp}` | Chat message |

### Drawing Events
| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `draw:start` | Client → Server | `{x, y, color, width, isEraser}` | Start a stroke |
| `draw:move` | Client → Server | `{x, y}` | Continue a stroke (volatile) |
| `draw:end` | Client → Server | — | End a stroke |
| `draw:shape` | Client → Server | `{type, x1, y1, x2, y2, color, width}` | Commit a shape |
| `canvas:clear` | Client → Server | — | Clear entire canvas |
| `canvas:undo` | Client → Server | — | Undo last stroke |
| `canvas:redo` | Client → Server | — | Redo last undone stroke |
| `canvas:history-update` | Server → All | `{history}` | Full canvas state after undo/redo |

### Cursor Events
| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `cursor:move` | Client → Server | `{x, y}` | Cursor position |
| `cursor:update` | Server → Others | `{userId, x, y}` | Relay cursor to room |

### WebRTC Events (Server is just a relay)
| Event | Payload | Description |
|-------|---------|-------------|
| `webrtc:join-video` | — | Announce video ready |
| `webrtc:video-peers` | `{peers: [socketId]}` | Existing video users |
| `webrtc:offer` | `{to, offer}` | SDP offer |
| `webrtc:answer` | `{to, answer}` | SDP answer |
| `webrtc:ice-candidate` | `{to, candidate}` | ICE candidate |

### Sticky Note Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `note:create` | Client → Server | Create new note |
| `note:created` | Server → All | Broadcast new note |
| `note:move` | Client → Server | Move note (volatile) |
| `note:moved` | Server → Others | Relay position update |
| `note:update` | Client → Server | Update note text |
| `note:delete` | Client → Server | Delete a note |

---

## ⚡ Performance Optimizations

This app has several optimizations to ensure smooth collaboration even with many users drawing simultaneously:

### 1. Throttled Mouse Emissions
```
Raw mousemove rate: ~200 events/sec
After optimization: ~14–40 emissions/sec per user

Two gates applied:
  ① Distance gate: skip if mouse moved < 3px
  ② Time gate: cap at ~70fps (14ms minimum between emissions)
```

### 2. Volatile Socket Emissions
```js
socket.volatile.emit('draw:move', {x, y});
```
If the network is congested, `volatile` allows Socket.io to **drop** the packet rather than queue it. This prevents a backlog of stale positions building up.

### 3. RAF Batching for Remote Rendering
```
Remote draw:move events arrive → pushed to remoteQueue[]
                                           ↓
requestAnimationFrame fires once per frame (~16ms)
                                           ↓
All pending events flushed in one batch → canvas updated
```
This ensures remote drawing never blocks your own input.

### 4. RAF Batching for Local Drawing
Same pattern applied locally — your own `mousemove` events are batched and flushed once per frame, preventing redundant `ctx.stroke()` calls.

### 5. Race Condition Prevention on Undo
When `canvas:history-update` arrives (after undo/redo):
```js
// Cancel any pending remote RAF first
cancelAnimationFrame(remoteRafId.current);
remoteQueue.current = [];  // drain stale events
remoteStroke.current = {};
// THEN clear + replay
ctx.clearRect(...);
replayHistory(history);
```
Without this, stale draw:move segments from the undone stroke would be flushed on top of the fresh canvas.

---

## ⚠️ Known Limitations

| Limitation | Reason | Fix |
|------------|--------|-----|
| **Board resets on server restart** | No database — all state is in-memory | Add MongoDB persistence |
| **No authentication** | Anyone who knows the Room ID can join | Add JWT auth + room passwords |
| **No text tool** | Canvas text requires complex hit-testing for sync | Planned feature |
| **No infinite canvas** | Fixed canvas size (fills the viewport) | Would require pan/zoom + coordinate mapping |
| **Video limited to 4 users** | Full mesh WebRTC gets exponentially heavier | Use an SFU (e.g. mediasoup) for 5+ users |
| **Single server** | Socket.io rooms are in-memory per process | Add Redis adapter for multi-server deployment |

---

## 👩‍💻 Built By

**Sanjana** — Full-stack implementation of SyncBoard including the real-time drawing engine, WebRTC integration, undo/redo system, and all collaborative features.

---

## 📜 License

MIT License — free to use, modify, and distribute.
