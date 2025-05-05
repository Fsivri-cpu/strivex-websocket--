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
    'http://localhost:8080',    // Development frontend
    'http://127.0.0.1:8080',    // Alternative local address
    process.env.FRONTEND_URL    // Production frontend URL (from .env)
  ].filter(Boolean),            // Filter out undefined values 
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

// Socket map to track connections by thread ID (for webhook callbacks)
const socketMap = new Map();

// Webhook endpoints for Relevance AI callbacks
// Supports both /api/relevance-webhook and /webhook paths
const handleWebhook = (req, res) => {
  try {
    console.log('Webhook received from Relevance AI');
    console.log('Webhook URL:', req.originalUrl);
    console.log('Webhook payload:', JSON.stringify(req.body, null, 2));
    
    // Extract the thread_id and parse response
    const threadId = req.body.thread_id;
    const parsedResponse = parseWebhookResponse(req.body);
    
    if (!threadId) {
      console.error('No thread_id found in webhook payload');
      return res.status(400).json({ error: 'No thread_id provided in webhook payload' });
    }
    
    // Find the socket connection for this thread
    const socket = socketMap.get(threadId);
    
    if (!socket) {
      console.warn(`No active socket found for thread ID: ${threadId}`);
      return res.status(200).json({ 
        status: 'accepted',
        message: 'Webhook received, but no active socket found for this thread ID'
      });
    }
    
    // Send the response to the client via WebSocket
    socket.emit('reply', {
      response: parsedResponse.text,
      conversationId: parsedResponse.conversation_id,
      timestamp: new Date().toISOString()
    });
    
    console.log(`Response sent to client (${socket.id}) via WebSocket`);
    
    // Acknowledge successful webhook processing
    return res.status(200).json({ status: 'success', message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Error processing webhook' });
  }
};

// Primary webhook endpoint
app.post('/api/relevance-webhook', express.json(), handleWebhook);

// Alternative webhook endpoint
app.post('/webhook', express.json(), handleWebhook);

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
  socketMap.set(threadId, socket);
  
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
      socketMap.set(socket.threadId, socket);
      
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
      const responseData = await sendMessageToRelevanceAI(
        data.message,
        agentId, 
        threadId
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
    
    // Remove from socket map
    if (socket.threadId) {
      socketMap.delete(socket.threadId);
      console.log(`Removed thread ID ${socket.threadId} from socket map`);
    }
  });
  
  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for client ${socket.id}:`, error);
    socket.emit('error', { message: 'An error occurred with your connection' });
  });

  // Handle ping to keep connection alive
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });

  // Handle disconnect event
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, Reason: ${reason}`);
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // In a production environment, you might want to exit the process
  // process.exit(1);
});
