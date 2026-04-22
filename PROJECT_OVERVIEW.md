# SyncBoard — Complete Project Overview

**Written for someone who has never seen or heard of this project before.**

---

## 1. What Did We Build?

We built an application called **SyncBoard** — a real-time collaborative whiteboard that runs in a web browser.

**In plain English:**
Imagine a physical whiteboard in a classroom. Multiple people can walk up to it and draw at the same time. SyncBoard does the exact same thing, but digitally — anyone with the link can join a shared "room" and draw together, see each other's cursors move, video call, chat, and leave sticky notes — all happening live, simultaneously, in the browser.

**No installation needed on a user's end.** You just open a browser, type a name, and start drawing.

---

## 2. The Problem It Solves

Remote teams, students, or friends often need a shared visual space to:
- Brainstorm ideas together
- Explain concepts with diagrams
- Sketch UI mockups collaboratively
- Discuss something face-to-face while drawing

Existing tools like Miro or Figma are expensive or require accounts. SyncBoard is a **free, self-hosted, open-source** alternative that you can run on your own machine or deploy to a server.

---

## 3. What Can Users Actually Do?

When you open SyncBoard, here is exactly what happens step by step:

### Step 1 — The Home Page
You land on a beautiful dark-themed home page. You see two things:
- A text field asking for your **username**
- An option to either **Create a New Room** (generates a unique Room ID automatically) or **type an existing Room ID** and join it

### Step 2 — The Whiteboard Room
Once you join, you enter a full-screen whiteboard room. The UI has:
- A **left sidebar** showing who is online in the room (with colored avatars and a green dot)
- A **toolbar at the top of the canvas** with all drawing tools
- A **dark canvas** occupying most of the screen (where you draw)
- A **floating video panel** (bottom-right) for video calls
- A **floating chat panel** (bottom-left) that slides open when needed

### What you can do on the canvas:

| Action | How |
|--------|-----|
| Draw freehand | Select ✏️ Pen → click and drag on canvas |
| Erase drawings | Select ⬜ Eraser → drag over drawings |
| Draw a rectangle | Select ▭ → click and drag to define corners |
| Draw a straight line | Select ╱ → click start point, drag to end |
| Change color | Click any of the 10 color swatches in toolbar |
| Change brush size | Click one of the 4 size circles |
| Undo your last stroke | Press `Ctrl+Z` |
| Redo an undone stroke | Press `Ctrl+Y` |
| Clear entire canvas | Click **Clear** button |
| Save as image | Click **PNG** button → file downloads instantly |
| Save as PDF | Click **PDF** button → file downloads instantly |
| Add a sticky note | Click **Note** button → drag it, type in it |
| Chat with others | Click **💬 Chat** in sidebar |
| Video call others | Click **Start Video** in the video panel |

**Everything except Export is synced live to all users in the same room.**

---

## 4. Technology Used (The Stack)

SyncBoard is a **full-stack web application** split into two parts: a **frontend** (what the user sees) and a **backend** (the server that coordinates everyone).

### Frontend — What the User Sees
Built with **React** (a JavaScript library for building UIs) using **Vite** (a fast development tool). The actual drawing is done with the **HTML5 Canvas API** — a built-in browser technology that lets you draw pixels programmatically. No external drawing library is used.

**Key frontend technologies:**
- `React 18` — component-based UI
- `HTML5 Canvas API` — raw pixel drawing engine
- `Socket.io Client` — connects to server for real-time events
- `WebRTC` — browser-native peer-to-peer video calling
- `React Router` — navigation between Home and Room pages
- `jsPDF` — PDF generation (loaded on demand)
- `Vanilla CSS` — all styling written from scratch (no Tailwind, no Bootstrap)

### Backend — The Server
Built with **Node.js** and **Express.js**. The server's job is to act as a message relay — when User A draws a stroke, the server forwards that stroke to User B, C, D, etc.

**Key backend technologies:**
- `Node.js` — JavaScript runtime
- `Express.js` — HTTP server
- `Socket.io` — real-time bidirectional communication (WebSockets under the hood)
- **In-memory storage** — all room state stored in JavaScript `Map` objects (no database)

### The Communication Protocol: Socket.io
Instead of the traditional request-response model (where a browser asks the server for data), Socket.io uses **WebSockets** — a persistent, two-way connection. This means:
- Server can push data to the browser **instantly** without the browser asking
- Browser can send events to the server **without page reloads**
- This is what enables the live collaborative experience

---

## 5. How the Real-Time Drawing Sync Works

This is the most technically interesting part of the project. Here is exactly what happens when you draw a stroke:

```
You press mouse button down on canvas
        ↓
startDrawing() fires → your browser draws a small dot
        ↓
You move the mouse (mousemove fires up to 200 times/second)
        ↓
[OPTIMIZATION] Distance gate: skip if mouse moved < 3 pixels
[OPTIMIZATION] Time gate: skip if less than 14ms since last emit (~70fps max)
        ↓
socket.volatile.emit('draw:move', {x, y})
← "volatile" means: if network is busy, DROP this packet rather than queue it
        ↓
Server receives it → broadcasts to all OTHER users in the room
        ↓
Other users' browsers receive 'draw:move' event
        ↓
[OPTIMIZATION] Event pushed into a queue (not rendered immediately)
        ↓
requestAnimationFrame fires (once per screen refresh, ~60fps)
        ↓
All queued events rendered in one batch on their canvas
        ↓
They see your stroke appear smoothly
```

**Why all these optimizations?** Without them, 5 users drawing simultaneously at 200 events/second = 1000 socket messages/second = server overload + choppy rendering. The optimizations bring this down to ~50–80 messages/second total, with smooth rendering.

---

## 6. How Undo/Redo Works

This is a **server-authoritative, stack-based undo system** — more complex than a simple local undo.

**The challenge:** If User A undoes a stroke, Users B and C also need to see it disappear. A simple local undo (just clearing pixels from your own canvas) won't work because other users' canvases won't be updated.

**The solution:**

```
Server maintains for each room:
  canvasHistory[]    — array of all completed strokes (in order)
  redoStacks{}       — per-user array of undone strokes

Each stroke stored as:
  { userId, color, width, points: [{x,y}, {x,y}, ...], isEraser, type }

When User A presses Ctrl+Z:
  1. Client emits 'canvas:undo' to server
  2. Server scans canvasHistory[] from end → finds last stroke where stroke.userId === A's socketId
  3. Removes that stroke from history
  4. Pushes it to A's redoStack
  5. Broadcasts 'canvas:history-update' with the FULL updated history to ALL users
  6. Every user's canvas: clearRect() → replay ALL strokes from scratch

When User A presses Ctrl+Y:
  1. Client emits 'canvas:redo'
  2. Server pops from A's redoStack → pushes back to canvasHistory
  3. Broadcasts 'canvas:history-update'
  4. All users replay

When User A draws a NEW stroke after undoing:
  A's redoStack is cleared (standard undo behavior — you can't redo after a new action)
```

**Important rule:** Each user can only undo/redo **their own strokes**. User A cannot undo what User B drew.

---

## 7. How WebRTC Video Calling Works

**WebRTC** (Web Real-Time Communication) is a browser-native technology for peer-to-peer video/audio. The video data travels **directly between browsers** — it does NOT go through our Node.js server. The server only handles the initial handshake (called "signaling").

```
The handshake process (simplified):

User A clicks "Start Video"
  → Gets camera/mic stream from browser
  → Tells server: "I'm ready for video" (webrtc:join-video)
  → Server responds: "These users already have video: [User B's ID]"

User A creates a connection to User B:
  → Creates RTCPeerConnection (browser built-in)
  → Generates an "offer" (technical description of what A can do: codecs, resolution)
  → Sends offer to B VIA the server (webrtc:offer)

User B receives the offer:
  → Creates their own RTCPeerConnection
  → Generates an "answer"
  → Sends answer back to A VIA the server (webrtc:answer)

Both exchange "ICE candidates" (possible network routes) VIA server
  → Browser tries each route until it finds one that works

Connection established — video flows DIRECTLY A ↔ B
  → Server is completely out of the loop for video data
```

This architecture (called **mesh**) works well for 2–4 users. For 5+ users, a different architecture (SFU — Selective Forwarding Unit) would be needed.

---

## 8. How Sticky Notes Work

Sticky notes are **DOM elements** (regular HTML divs), NOT drawn on the canvas. They sit in a transparent overlay layer above the canvas.

```
Architecture:
  .canvas-container (position: relative)
    ├── <canvas>           z-index: 1  ← drawing surface
    ├── RemoteCursors      z-index: 10 ← cursor overlays
    └── StickyNotes        z-index: 20 ← note overlays

Each note is a <div> with:
  position: absolute
  transform: translate(x, y)  ← GPU-accelerated positioning
```

**Why DOM instead of Canvas?**
- DOM elements support native text input (no need to implement a text editor)
- Drag-and-drop is much easier with mouse events on a div
- Notes can have their own hover/click states

**Real-time sync:** Every note action (create, move, edit text, delete) emits a socket event. Move events use `socket.volatile.emit` (same optimization as drawing — drop packets if network busy).

---

## 9. The Server's State Management

The server holds all room state in a class called `RoomManager`. There is no database — everything lives in memory while the server runs (restarting the server clears all boards).

```
RoomManager manages:

rooms: Map {
  "room-abc123": Map {
    "socketId1": { userId, username, color, joinedAt },
    "socketId2": { userId, username, color, joinedAt }
  }
}

canvasHistory: Map {
  "room-abc123": [
    { type: 'pen', userId, color, width, points: [...] },
    { type: 'rect', userId, color, width, points: [p0, p1] },
    { type: 'pen', userId, isEraser: true, color, width, points: [...] }
  ]
}

redoStacks: Map {
  "socketId1": [stroke, stroke],
  "socketId2": []
}

notes: Map {
  "room-abc123": Map {
    "noteId1": { id, text, x, y, color, userId, createdAt }
  }
}

videoParticipants: Map {
  "room-abc123": Set { "socketId1", "socketId2" }
}
```

When a room becomes empty (last user leaves), all its state is automatically deleted to free memory.

---

## 10. The File Structure Explained

```
white_board/
│
├── client/                    ← Everything the user's browser downloads
│   └── src/
│       ├── pages/
│       │   ├── Home.jsx       ← The landing page (enter name + room ID)
│       │   └── Room.jsx       ← The actual whiteboard page (orchestrates everything)
│       │
│       ├── components/
│       │   ├── Whiteboard.jsx       ← The <canvas> element + entire toolbar
│       │   ├── RemoteCursors.jsx    ← Renders other users' cursors as colored arrows
│       │   ├── StickyNotes.jsx      ← Renders draggable note divs
│       │   ├── VideoPanel.jsx       ← Floating video call UI
│       │   ├── ChatPanel.jsx        ← Floating chat UI
│       │   ├── ConnectionStatus.jsx ← Green/red dot for socket connection
│       │   └── Toast.jsx            ← Pop-up notifications (join/leave)
│       │
│       ├── hooks/                   ← Reusable logic, separated from UI
│       │   ├── useDrawing.js        ← ALL drawing logic: local RAF, remote RAF,
│       │   │                           socket emit/receive, undo/redo, shape/eraser,
│       │   │                           replayHistory for late joiners
│       │   ├── useCursor.js         ← Tracks and broadcasts cursor position
│       │   ├── useRoom.js           ← Manages joining room, user list, toast triggers
│       │   ├── useWebRTC.js         ← Creates RTCPeerConnections, handles signaling
│       │   ├── useNotes.js          ← Notes state + socket sync
│       │   ├── useChat.js           ← Chat messages state + socket sync
│       │   └── useSocket.js         ← Creates the Socket.io connection
│       │
│       └── context/
│           └── SocketContext.jsx    ← Makes the socket instance available
│                                       to all components without prop drilling
│
└── server/
    └── src/
        ├── server.js                ← Creates Express app, attaches Socket.io,
        │                               starts listening on port 3001
        └── socket/
            ├── handlers.js          ← Registers ALL socket event listeners.
            │                           Every event the client can emit is handled here.
            └── RoomManager.js       ← Pure data management class.
                                        No socket logic — just manages the Maps.
```

---

## 11. How to Run This Project

### Requirements
- Node.js (version 18 or higher)
- A terminal

### Commands

```bash
# 1. Get the code
git clone https://github.com/Sanjana23-is/white-board.git
cd white-board

# 2. Install server packages
cd server
npm install

# 3. Start the server (keep this terminal open)
npm run dev
# You should see: 🚀 Server running on http://localhost:3001

# 4. Open a NEW terminal, install frontend packages
cd ../client
npm install

# 5. Start the frontend
npm run dev
# You should see: ➜ Local: http://localhost:5174/

# 6. Open http://localhost:5174 in your browser
# Open it in a second tab too — enter the same Room ID to collaborate!
```

---

## 12. What Makes This Project Non-Trivial

This is not a simple CRUD app. Here is what makes it technically challenging:

### Challenge 1 — Race conditions in undo
When undo fires `canvas:history-update`, pending `draw:move` events from the undone stroke might still be in the RAF queue waiting to render. If we don't drain that queue first, those stale segments render ON TOP of the freshly cleared canvas — the undo appears to not work. Fix: cancel RAF + drain queue atomically before clearing.

### Challenge 2 — Zero-height canvas on mount
React's `useEffect` runs after the DOM renders, but the canvas element might have zero height if its parent container's flexbox layout hasn't been computed yet. Fix: use `requestAnimationFrame` inside the resize handler to read dimensions after layout.

### Challenge 3 — WebRTC signaling coordination
Who initiates the offer — the new joiner or the existing user? If both initiate simultaneously, you get a "glare condition" (two offers, no answers). Fix: the **new joiner always initiates** offers to all existing video users (tracked on server).

### Challenge 4 — Late joiner canvas sync
When a user joins after 20 minutes of drawing, their canvas is blank. Fix: server keeps full stroke history (`canvasHistory[]`), sends it on `room:joined`, client replays all strokes synchronously.

### Challenge 5 — Eraser composite operation in replay
Drawing eraser strokes uses `canvas.globalCompositeOperation = 'destination-out'` (erases pixels). When replaying history, strokes must be replayed **in order** and eraser strokes must set this composite operation correctly. Fix: each stroke in history carries an `isEraser` boolean.

---

## 13. Limitations (Being Honest)

| Limitation | Why It Exists |
|------------|---------------|
| Board resets on server restart | No database — pure in-memory storage |
| Anyone can join any room | No user authentication implemented |
| No text tool | Canvas text requires complex hit-detection for real-time sync |
| No infinite canvas | Fixed to viewport size — pan/zoom would need coordinate mapping |
| Video works for 2–4 users | Full mesh WebRTC gets exponentially heavier with more users |
| No mobile support | Touch events partially handled but not optimized |

---

## 14. Summary

**SyncBoard** is a real-time collaborative whiteboard with:
- Live drawing sync (pen, eraser, rectangle, line)
- Server-authoritative undo/redo synced across all users
- Live cursor tracking with usernames
- Peer-to-peer WebRTC video calling
- Real-time chat panel
- Draggable sticky notes
- PNG/PDF export
- Canvas history replay for late joiners

Built with **React + Node.js + Socket.io + WebRTC + HTML5 Canvas API**.

It demonstrates expertise in: WebSocket communication, real-time state synchronization, WebRTC signaling, performance optimization (RAF batching, throttling), and React architecture (custom hooks, context, refs).
