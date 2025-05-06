// Simplified Socket.IO backend for Relevance AI
// Uses FastAPI microservice for handling streaming responses

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { fetch } from 'undici';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Simplified CORS setting
app.use(cors({ origin: "*" }));

// Get current directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);

// Basic health check endpoint
app.get('/', (req, res) => {
  res.send('Relevance AI WebSocket Server - Streaming Edition');
});

// Compatibility proxy endpoint for api-test.html
app.post('/api/test', express.json(), async (req, res) => {
  try {
    const { message, agentId } = req.body;
    
    // Forward to FastAPI service
    const apiRes = await fetch(`${process.env.PY_CHAT_URL || 'http://localhost:8000'}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, agent_id: agentId, stream: false })
    });
    
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(apiRes.status).send(errText);
    }
    
    // Return the JSON response from FastAPI
    const data = await apiRes.json();
    return res.json(data);
  } catch (error) {
    console.error('Error in /api/test proxy:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  transports: ['websocket', 'polling']
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle incoming messages
  socket.on('message', async ({ message, agentId, messageId }) => {
    if (!message) {
      socket.emit('error', { message: 'No message provided' });
      return;
    }
    
    try {
      // Forward request to FastAPI microservice
      const res = await fetch(`${process.env.PY_CHAT_URL || 'http://localhost:8000'}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message, 
          agent_id: agentId, 
          stream: true 
        })
      });

      if (!res.ok) {
        const err = await res.text();
        socket.emit('error', { message: `AI error: ${err}` });
        return;
      }
      
      // Check if we got JSON (polling fallback) or SSE stream
      if (res.headers.get('content-type') === 'application/json') {
        // Polling fallback - single complete response
        const { response } = await res.json();
        socket.emit('reply', { response, messageId });
        return;
      }

      // Process SSE stream and forward chunks to client
      for await (const chunk of res.body) {
        const txt = chunk.toString().replace(/^data:/, '').trim();
        if (txt) socket.emit('reply', { response: txt, messageId });
      }
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: `Error: ${error.message}` });
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
  console.log(`Make sure FastAPI service is running at ${process.env.PY_CHAT_URL || 'http://localhost:8000'}`);
  console.log(`Test page should be available at: http://localhost:${PORT}/test.html`);
});
