# Relevance AI WebSocket + Webhook Backend

A real-time WebSocket backend with Webhook support for integrating with Relevance AI, built with Node.js, Express, and Socket.IO.

## Features

- Express web server with WebSocket support via Socket.IO
- Real-time communication with Relevance AI via Webhook callbacks
- Secure environment variable configuration
- CORS support for frontend integration
- Error handling and logging
- Test page for WebSocket and API integration

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Relevance AI API key

## Installation

1. Clone this repository or download the code
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

4. Create a `.env` file based on the provided `.env.example`:

```bash
cp .env.example .env
```

5. Edit the `.env` file and add your Relevance AI API key

## Usage

### Starting the server

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

## WebSocket + Webhook Integration

This project uses a combination of WebSocket and Webhook technologies:

1. **WebSocket**: Used for real-time communication between the frontend client and the backend server
2. **Webhook**: Used for receiving asynchronous responses from Relevance AI

To use it in your frontend project:

1. Install Socket.IO client:

```bash
npm install socket.io-client
```

Or include via CDN:

```html
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
```

2. Connect to the WebSocket server and handle events like in the test.html example:

```javascript
const socket = io('http://your-server-url:3000');

// Send a message
socket.emit('send_message', { message: 'Hello AI!', messageId: 'msg123' });

// Listen for responses
socket.on('reply', (data) => {
  console.log('Response:', data.response);
});
```

## Deployment to Railway.app

Railway.app makes deployment simple:

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
