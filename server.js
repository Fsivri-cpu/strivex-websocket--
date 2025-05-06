/**
 * Server.js - Main entry point for the WebSocket server
 * 
 * This file sets up an Express web server with Socket.IO for WebSocket
 * communication. It handles incoming messages from clients, sends them
 * to Relevance AI, and returns the responses.
 */

// Import required packages
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { sendMessageToRelevanceAI, parseWebhookResponse } = require('./relevance');

// Import API test route
const apiTestRouter = require('./api-test-route');

// Load environment variables from .env file
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure CORS for Express - Frontend için yetkilendirme
app.use(cors({
  origin: [
    'http://localhost:8080',      // Development frontend
    'http://127.0.0.1:8080',      // Alternative local address
    process.env.FRONTEND_URL,     // Production frontend URL (from .env)
    process.env.SERVER_URL,       // Railway URL (production server)
    'https://strivex-websocket-production.up.railway.app',  // Railway exact domain
    '*'                           // Geçici olarak tüm originlere izin ver
  ].filter(Boolean),              // Filter out undefined values
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON ve URL encoded middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API test router
app.use('/api', apiTestRouter);

// Serve static files from the public directory (if exists)
app.use(express.static('public'));

// Basic Express route for health check
app.get('/', (req, res) => {
  res.send('Relevance AI WebSocket Server is running.');
});

// Simple webhook test endpoint that can be accessed via browser
app.get('/api/test-webhook-get', (req, res) => {
  console.log('----------------------------------------');
  console.log('🔎 GET WEBHOOK TEST RECEIVED 🔎');
  console.log('Query params:', req.query);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Timestamp:', new Date().toISOString());
  console.log('----------------------------------------');
  
  res.status(200).json({ 
    success: true,
    message: 'GET webhook test received successfully',
    timestamp: new Date().toISOString(),
    note: 'If you can see this response, your webhook endpoint is accessible from outside'
  });
});

// Socket map to track connections by thread ID (for webhook callbacks)
// Her thread ID için birden fazla socket bağlantısını destekler (Set olarak)
const threadSocketsMap = new Map();

// Webhook endpoints for Relevance AI callbacks
// Supports both /api/relevance-webhook and /webhook paths
const handleWebhook = (req, res) => {
  try {
    console.log('----------------------------------------');
    console.log('📫 WEBHOOK RECEIVED FROM RELEVANCE AI 📫');
    console.log('Webhook URL:', req.originalUrl);
    console.log('Webhook Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Webhook Body:', JSON.stringify(req.body, null, 2));
    console.log('Timestamp:', new Date().toISOString());
    
    // Always return a success response immediately to prevent timeouts
    res.status(200).json({ 
      status: 'success',
      message: 'Webhook received and processing',
      timestamp: new Date().toISOString()
    });
    
    // Now process the webhook data after sending the response
    // This prevents timeouts
    setTimeout(() => {
      try {
        // Extract thread_id from multiple possible locations
        const threadId = req.body.thread_id || 
                       req.body.threadId || 
                       req.body.conversation_id ||
                       (req.body.task && req.body.task.thread_id) ||
                       req.body.id; // Herhangi bir ID alanını kontrol et
        
        console.log(`Identified thread_id: ${threadId}`);
        
        if (!threadId) {
          console.error('No thread_id or conversation_id found in webhook payload');
          console.log('Full payload for debugging:', JSON.stringify(req.body, null, 2));
          return;
        }
        
        // Try using our standard parser first
        const parsedResponse = parseWebhookResponse(req.body);
        
        // Get the set of sockets for this thread ID
        const socketSet = threadSocketsMap.get(threadId);
        
        if (!socketSet || socketSet.size === 0) {
          console.warn(`No active socket found for thread ID: ${threadId}`);
          
          // Debug: list all active threads
          console.log('Active threads:');
          for (const [key, value] of threadSocketsMap.entries()) {
            console.log(`- ${key}: ${value.size} connections`);
          }
          
          return;
        }
        
        // Send the response to the client via WebSocket
        console.log(`Sending webhook response to ${socketSet.size} connected clients with thread ID ${threadId}`);
        
        // Send the parsed response to all connected clients for this thread via WebSocket
        let clientCount = 0;
        socketSet.forEach(socket => {
          if (socket.connected) {
            socket.emit('reply', {
              response: parsedResponse.text,
              conversationId: parsedResponse.conversation_id,
              timestamp: new Date().toISOString()
            });
            clientCount++;
            console.log(`Response sent to client (${socket.id}) via WebSocket`);
          }
        });
        
        console.log(`Response successfully delivered to ${clientCount} clients`);
      } catch (error) {
        console.error('Error processing webhook after response:', error);
      }
    }, 0);
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Error processing webhook' });
  }
};

// Primary webhook endpoint
app.post('/api/relevance-webhook', express.json(), handleWebhook);

// Alternative webhook endpoint
app.post('/webhook', express.json(), handleWebhook);

// Test webhook endpoint - Sadece webhook mesajlarını kaydetmek ve test etmek için
app.post('/api/test-webhook', express.json(), (req, res) => {
  console.log('\n📥 TEST WEBHOOK RECEIVED 📥');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Timestamp:', new Date().toISOString());
  console.log('📤 SENDING TEST WEBHOOK RESPONSE 📤\n');
  
  // Webhook isteklerini günlüğe kaydetme fonksiyonu
  logWebhookRequest(req);

  // Her zaman başarılı yanıt ver
  res.status(200).json({ 
    status: 'success',
    message: 'Test webhook received successfully',
    timestamp: new Date().toISOString(),
    echo: req.body
  });
});

// Detailed test webhook endpoint with verbose logging
app.post('/api/test-webhook-verbose', express.json(), (req, res) => {
  console.log('----------------------------------------');
  console.log('🔍 TEST WEBHOOK RECEIVED - VERBOSE LOG 🔍');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('URL:', req.url);
  console.log('Method:', req.method);
  console.log('IP:', req.ip);
  console.log('Timestamp:', new Date().toISOString());
  console.log('----------------------------------------');
  
  // Always return success to Relevance AI
  res.status(200).json({ 
    status: 'success',
    message: 'Test webhook received and logged',
    echo: req.body
  });
});

// Debug function to print all active threads and connections
function logActiveThreads() {
  console.log('----------------------------------------');
  console.log('ACTIVE THREADS:');
  let totalConnections = 0;
  
  for (const [threadId, socketSet] of threadSocketsMap.entries()) {
    console.log(`- ${threadId}: ${socketSet.size} connections`);
    totalConnections += socketSet.size;
  }
  
  console.log(`Total: ${threadSocketsMap.size} threads, ${totalConnections} connections`);
  console.log('----------------------------------------');
}

// Call this function periodically and after connections/disconnections
setInterval(logActiveThreads, 60000); // Log every minute

// Webhook isteklerini günlüğe kaydetme fonksiyonu
function logWebhookRequest(req) {
  try {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp: timestamp,
      headers: req.headers,
      body: req.body,
      ip: req.ip || req.connection.remoteAddress
    };
    
    // Konsola daha detaylı log yazdır
    console.log(`\n[${timestamp}] Webhook request received from ${logData.ip}`);
    
    // Production'da bu logu bir dosyaya veya veritabanına kaydedebilirsiniz
    // Örneğin: fs.appendFileSync('webhook_logs.json', JSON.stringify(logData) + '\n');
  } catch (error) {
    console.error('Error logging webhook request:', error);
  }
}

// Configure Socket.IO with CORS settings
const io = socketIo(server, {
  cors: {
    origin: [
      'http://localhost:8080',  // Development frontend
      'http://127.0.0.1:8080',  // Alternative local address
      process.env.FRONTEND_URL  // Production frontend URL (from .env)
    ].filter(Boolean),          // Filter out undefined values
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Enable both WebSocket and polling for maximum compatibility
  transports: ['websocket', 'polling']
});

console.log('Socket.IO initialized with websocket and polling transports');

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Generate a unique thread ID for this socket connection
  const threadId = `thread_${Date.now()}_${socket.id.replace(/[^a-zA-Z0-9]/g, '')}`;  
  
  // Store the socket connection in the map with its thread ID
  socket.threadId = threadId;
  
  // Bağlantı kurulur kurulmaz threadSocketsMap'e ekle (frontend'den mesaj beklemeden)
  if (!threadSocketsMap.has(threadId)) {
    threadSocketsMap.set(threadId, new Set());
  }
  threadSocketsMap.get(threadId).add(socket);
  
  console.log(`Socket ${socket.id} added to thread ${threadId} on connection. Map size for thread: ${threadSocketsMap.get(threadId).size}`);
  
  console.log(`Assigned thread ID ${threadId} to client ${socket.id}`);
  
  // Send welcome message to client
  socket.emit('connection_status', { 
    status: 'connected',
    message: 'Connected to Relevance AI WebSocket server',
    threadId: threadId
  });

  // Handle incoming messages from clients
  socket.on('message', async (data) => {
    console.log(`Received message from client ${socket.id} on thread ${socket.threadId}: ${data.message}`);

    // Validate message content
    if (!data.message) {
      socket.emit('error', { message: 'No message content provided' });
      return;
    }
    
    // If this is a new thread, assign a thread ID
    if (!socket.threadId) {
      socket.threadId = `thread_${Date.now()}_${socket.id}`;
      console.log(`Assigned thread ID ${socket.threadId} to client ${socket.id}`);
      
      // Store this socket in our thread map for webhook callbacks
      if (!threadSocketsMap.has(socket.threadId)) {
        threadSocketsMap.set(socket.threadId, new Set());
      }
      threadSocketsMap.get(socket.threadId).add(socket);
      
      console.log(`Socket ${socket.id} added to thread ${socket.threadId}. Total connections for this thread: ${threadSocketsMap.get(socket.threadId).size}`);
      
      // Let the client know their thread ID
      socket.emit('thread_assigned', { threadId: socket.threadId });
    }
    
    // Use the socket's assigned thread ID for this conversation
    const threadId = socket.threadId;
    
    // Track message ID for response matching, generate if not provided
    if (!data.messageId) {
      data.messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }
      
    // Get agent ID from data or fallback to env variable
    const agentId = data.agentId || process.env.AGENT_ID;
    
    if (!agentId) {
      socket.emit('error', { message: 'Agent ID is required' });
      return;
    }
    
    // Log information about the message being sent
    console.log(`Sending message to Relevance AI using agents/trigger endpoint`);
    console.log(`Thread ID: ${threadId}`);
    
    // Let the client know we're processing their message
    socket.emit('processing', {
      messageId: data.messageId,
      status: 'processing'
    });

    try {
      // Send message to Relevance AI using the updated agents/trigger endpoint
      // Webhook URL is now included in the payload to receive response via webhook callback
      // Socket callback ekleyerek webhook gelmezse polling yedek mekanizmasını aktifleştir
      const responseData = await sendMessageToRelevanceAI(
        data.message,
        agentId, 
        threadId,
        // Socket callback fonksiyonu - webhook gelmezse polling ile yanıt almak için
        (eventType, eventData) => {
          switch(eventType) {
            case 'processing':
              socket.emit('processing', {
                messageId: eventData.messageId || data.messageId,
                status: 'processing',
                message: eventData.message || 'Backup polling started'
              });
              break;
            case 'reply':
              socket.emit('reply', {
                messageId: data.messageId,
                response: eventData.response,
                conversationId: eventData.conversationId || responseData.conversation_id
              });
              break;
            case 'error':
              socket.emit('error', {
                messageId: data.messageId,
                message: eventData.message || 'Error from polling',
                error: eventData.error
              });
              break;
          }
        }
      );

      // If we have a conversation_id, send an initial acknowledgment
      if (responseData && responseData.conversation_id) {
        // Log that the message was sent and we're waiting for webhook
        console.log(`Message sent to Relevance AI. Conversation ID: ${responseData.conversation_id}`);
        console.log(`Waiting for webhook callback to thread ID ${threadId}`);
        
        // Send an acknowledgment to the client
        socket.emit('message_sent', {
          messageId: data.messageId,
          conversationId: responseData.conversation_id,
          threadId: threadId,
          status: 'processing',
          message: 'Message sent to Relevance AI, waiting for response via webhook'
        });
      } else {
        throw new Error('No valid response from Relevance AI');
      }
    } catch (error) {
      console.error('Error handling message:', error);
      socket.emit('error', { 
        messageId: data.messageId,
        message: `Error processing your message: ${error.message}`
      });
    }
  });

  // Handle disconnect - clean up socketMap
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, Thread ID: ${socket.threadId}, Reason: ${reason}`);
    
    // Remove from thread sockets map
    if (socket.threadId && threadSocketsMap.has(socket.threadId)) {
      const socketSet = threadSocketsMap.get(socket.threadId);
      socketSet.delete(socket);
      
      // If no more sockets for this thread, remove the thread entry
      if (socketSet.size === 0) {
        threadSocketsMap.delete(socket.threadId);
        console.log(`Removed thread ID ${socket.threadId} from thread sockets map (no more connections)`);
      } else {
        console.log(`Removed socket ${socket.id} from thread ID ${socket.threadId}. Remaining connections: ${socketSet.size}`);
      }
    }
  });
  
  // Handle errors - hem socket hem de engine-io hatalarını yakala
  socket.on('error', (error) => {
    console.error(`Socket error for client ${socket.id}:`, error);
    socket.emit('error', { message: 'An error occurred with your connection' });
  });
  
  // Socket.IO engine hataları için
  socket.io?.engine?.on('error', (error) => {
    console.error(`Engine error for client ${socket.id}:`, error);
  });
  
  // Socket bağlantı hataları için global handler
  io.engine?.on('connection_error', (error) => {
    console.error(`Connection error:`, error);
  });

  // Handle ping to keep connection alive
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to confirm the server is running`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('SIGTERM received - Shutting down gracefully');
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Close Socket.IO connections
  io.close(() => {
    console.log('Socket.IO server closed');
  });
  
  // Exit after 5 seconds if not already closed
  setTimeout(() => {
    console.log('Forcing exit after timeout');
    process.exit(0);
  }, 5000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // In a production environment, you might want to exit the process
  // process.exit(1);
});
