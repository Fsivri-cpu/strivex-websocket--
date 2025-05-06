# Relevance AI WebSocket + FastAPI (Streaming/Polling) Backend

A real-time WebSocket backend for integrating with Relevance AI, built with Node.js, Express, Socket.IO, and FastAPI. Supports both streaming responses (word-by-word) with automatic fallback to polling when streaming is disabled.

## Features

- Express web server with WebSocket support via Socket.IO
- Python FastAPI microservice for interacting with Relevance AI
- Real-time streaming responses (when enabled in Relevance AI)
- Automatic fallback to polling when streaming is not available
- Simple architecture with minimal dependencies
- CORS support for frontend integration
- Error handling and logging

## Prerequisites

- Node.js (v18 or higher)
- Python 3.8+ with pip
- npm or yarn
- Relevance AI API key

## Installation

1. Clone this repository or download the code
2. Navigate to the project directory
3. Install Node.js dependencies:

```bash
npm install
```

4. Install Python dependencies:

```bash
pip install -r requirements.txt
```

5. Create a `.env` file with your Relevance AI credentials:

```bash
# Node.js service
PY_CHAT_URL=http://localhost:8000

# Python service
RELEVANCEAI_API_KEY=your_api_key
RELEVANCEAI_PROJECT=your_project_id
RELEVANCEAI_REGION=d7b62b  # or your region
AGENT_ID=your_agent_id
```

## Usage

### Starting the services

1. Start the Python FastAPI service:

```bash
uvicorn chat_service:app --host 0.0.0.0 --port 8000
```

2. Start the Node.js WebSocket server:

Development mode with auto-restart:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### Testing the server

You can test if the server is running by visiting:

```
http://localhost:3000
```

You should see the message: "Relevance AI WebSocket Server is running."

## How It Works

This project uses a multi-service architecture:

1. **Node.js Socket.IO Server**: Handles real-time WebSocket connections with the frontend client
2. **Python FastAPI Service**: Interfaces with Relevance AI and handles streaming/polling logic

Data flow:
- Frontend sends message → Socket.IO server
- Socket.IO server forwards message → FastAPI service
- FastAPI service attempts streaming from Relevance AI
- If streaming is enabled: real-time word-by-word responses flow back to the client
- If streaming is disabled: automatically falls back to polling with a complete response

### Frontend Integration

1. Install Socket.IO client:

```bash
npm install socket.io-client
```

Or include via CDN:

```html
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
```

2. Connect to the WebSocket server:

```javascript
const socket = io('http://your-server-url:3000');

// Send a message
socket.emit('message', { 
  message: 'Hello AI!',
  agentId: 'your-agent-id' // Optional if set as env var
});

// Listen for responses
socket.on('reply', (data) => {
  console.log('Response chunk:', data.response);
  // Append to UI for streaming effect
});

// Handle errors
socket.on('error', (data) => {
  console.error('Error:', data.message);
});
```

## Deployment to Railway.app

This application requires deploying two services on Railway:

### 1. Python FastAPI Service

1. Create a new service from GitHub repository
2. Set the following environment variables:
   - `RELEVANCEAI_API_KEY`
   - `RELEVANCEAI_PROJECT`
   - `RELEVANCEAI_REGION`
   - `AGENT_ID` (optional, can be provided per-request)
3. Override the start command:
   ```
   python -m uvicorn chat_service:app --host 0.0.0.0 --port $PORT
   ```

### 2. Node.js WebSocket Service

1. Create a new service from the same GitHub repository
2. Set the environment variable:
   - `PY_CHAT_URL` (URL of your deployed Python service)
3. Railway will automatically use the start command from package.json

Once both services are running, your frontend can connect to the Node.js WebSocket service.

1. Create an account on [Railway.app](https://railway.app)
2. Install the Railway CLI:

```bash
npm i -g @railway/cli
```

3. Login to Railway:

```bash
railway login
```

4. Initialize a new project from your local directory:

```bash
railway init
```

5. Add your environment variables:

```bash
railway vars set RAI_AUTH_TOKEN=your_api_auth_token_here
railway vars set AGENT_ID=your_agent_id_here
railway vars set SERVER_URL=https://your-app-url.railway.app
```

6. Deploy the project:

```bash
railway up
```

7. Open your deployed project:

```bash
railway open
```

## Project Structure

- `server.js` - Main entry point, sets up Express, Socket.IO and Webhook endpoint
- `relevance.js` - Handles communication with Relevance AI API
- `api-test-route.js` - Provides API test endpoints for Relevance AI integration
- `public/test.html` - Test page for WebSocket and API integration
- `package.json` - Project dependencies and scripts
- `.env` - Environment variables configuration

## Common Issues and Troubleshooting

### CORS Issues

If you're experiencing CORS errors:

1. Check that the `ALLOWED_ORIGINS` in your `.env` file includes your frontend domain
2. For development, you can set `ALLOWED_ORIGINS=*` but restrict this in production
3. Ensure your frontend is connecting to the correct WebSocket server URL

### Connection Problems

If the WebSocket connection fails:

1. Verify that the server is running
2. Check network settings and firewalls
3. Confirm the WebSocket URL is correct in your frontend code
4. Try using `transports: ['websocket', 'polling']` in your Socket.IO client configuration

### Webhook Issues

If webhook callbacks are not working:

1. Ensure your server is publicly accessible (not localhost)
2. Verify that the webhook URL is correctly set in the Relevance AI request
3. Check server logs for any webhook-related errors
4. For local development, consider using a service like ngrok to expose your local server

### API Authentication Issues

If you're experiencing problems with the Relevance AI API:

1. Verify your `RAI_AUTH_TOKEN` is correct in the `.env` file
2. Check that you're using the correct API endpoint for your region
3. Confirm you have the correct `AGENT_ID` in your configuration
4. For webhook functionality, ensure your `SERVER_URL` is publicly accessible

### Deployment Errors

Common Railway.app deployment issues:

1. Ensure you've set all required environment variables
2. Check that your `package.json` has a valid `start` script
3. Verify your Node.js version compatibility

## License

MIT
