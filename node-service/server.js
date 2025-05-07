// Simplified Socket.IO backend for Relevance AI
// Uses FastAPI microservice for handling streaming responses

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { fetch } from 'undici';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 1) public klasöründeki tüm dosyaları "/" yolu altından sun
app.use(express.static(join(__dirname, 'public')));

// Basic health check endpoint
app.get('/', (req, res) => {
  res.send('Relevance AI WebSocket Server - Streaming Edition');
});

// Compatibility proxy endpoint for api-test.html
app.post('/api/test', express.json(), async (req, res) => {
  try {
    const { message, agentId } = req.body;
    console.log(`[DEBUG] /api/test received: message="${message}", agentId=${agentId}`);
    
    // Forward to FastAPI service - using stream:true like the WebSocket handler
    const apiRes = await fetch(`${process.env.PY_CHAT_URL || 'http://localhost:8000'}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, agent_id: agentId, stream: true })
    });
    
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error(`[ERROR] /api/test forward failed with status ${apiRes.status}: ${errText}`);
      return res.status(apiRes.status).send(errText);
    }
    
    // For stream:true responses, we need to collect all chunks
    if (apiRes.headers.get('content-type')?.includes('text/event-stream')) {
      console.log(`[INFO] Received SSE stream response, processing...`);
      let fullResponse = '';
      
      try {
        for await (const chunk of apiRes.body) {
          const text = chunk.toString().replace(/^data:/, '').trim();
          if (text) fullResponse += text;
        }
        console.log(`[INFO] Successfully collected response: ${fullResponse.substring(0, 50)}...`);
        return res.json({ response: fullResponse });
      } catch (streamErr) {
        console.error(`[ERROR] Error processing stream: ${streamErr}`);
        return res.status(500).json({ error: `Stream processing error: ${streamErr.message}` });
      }
    } else {
      // Fallback for JSON responses
      const data = await apiRes.json();
      return res.json(data);
    }
  } catch (error) {
    console.error('[ERROR] Error in /api/test proxy:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 2) HTTP + WebSocket sunucusunu oluştur
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
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
httpServer.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} üzerinde dinliyor.`);
  console.log(`Make sure FastAPI service is running at ${process.env.PY_CHAT_URL || 'http://localhost:8000'}`);
  console.log(`Test page should be available at: http://localhost:${PORT}/test.html`);
});
