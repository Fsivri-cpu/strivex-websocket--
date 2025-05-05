/**
 * Relevance.js - Functions for communicating with Relevance AI API
 * 
 * This module handles communication with the Relevance AI API using the correct
 * endpoints and methods as specified in the Relevance AI documentation.
 * 
 * Updated to use webhook callbacks for real-time responses instead of polling.
 */

const fetch = require('node-fetch');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// API endpoint configuration
const RELEVANCE_API_BASE_URL = process.env.RELEVANCE_API_BASE_URL || 'https://api-d7b62b.stack.tryrelevance.com/latest';
const AGENT_ID = process.env.AGENT_ID;
const RAI_AUTH_TOKEN = process.env.RAI_AUTH_TOKEN;

// Validate required environment variables
if (!AGENT_ID) {
  console.warn('Warning: AGENT_ID environment variable is not set. You will need to provide agentId with each request.');
}

if (!RAI_AUTH_TOKEN) {
  console.warn('Warning: RAI_AUTH_TOKEN environment variable is not set. This is required for Relevance AI API communication.');
}

// Set production mode for better performance
const isProduction = process.env.NODE_ENV === 'production';
console.log(isProduction ? 'Set production mode for Relevance AI service' : 'Running in development mode');

// Log configuration for debugging
console.log('Relevance AI Configuration:');
console.log('- API Base URL:', RELEVANCE_API_BASE_URL);
console.log('- Default Agent ID:', process.env.AGENT_ID || '(not set)');
// Not logging API key for security reasons

/**
 * Send a message to the Relevance AI API using the correct agents/trigger endpoint
 * @param {string} message - Message text to send
 * @param {string} agentId - Relevance AI Agent ID
 * @param {string} threadId - Thread ID for conversation tracking
 * @returns {Promise<object>} Response data
 */
async function sendMessageToRelevanceAI(message, agentId, threadId = null) {
  try {
    if (!message) {
      throw new Error('Message is required');
    }

    // Authorize correctly using the API Key format Relevance AI requires
    const authToken = RAI_AUTH_TOKEN;
    
    if (!authToken) {
      throw new Error('API key is required');
    }

    // Determine token format type for correct header formatting
    console.log(`Using auth token pattern: ${authToken.includes(':') ? 'project:key format' : 'simple key format'}`);

    // Doğru endpoint: agents/trigger
    const triggerUrl = `${RELEVANCE_API_BASE_URL}/agents/trigger`;
    console.log('Using Relevance AI agents/trigger endpoint:', triggerUrl);
    
    // Webhook URL for callback (SERVER_URL must be set in .env)
    const serverUrl = process.env.SERVER_URL;
    if (!serverUrl) {
      throw new Error('SERVER_URL environment variable is required for webhook callbacks');
    }
    
    const webhookUrl = `${serverUrl}/api/relevance-webhook`;
    console.log('Using webhook callback URL:', webhookUrl);

    // Build the request body with webhook information
    const requestBody = {
      message: {
        role: "user",
        content: message
      },
      agent_id: agentId,
      // Add webhook information for callback
      webhook: {
        url: webhookUrl,
        include_thread_id: true
      }
    };

    // Add thread_id for conversation tracking if provided
    if (threadId) {
      requestBody.thread_id = threadId;
      console.log(`Using thread ID: ${threadId}`);
    }

    console.log(`Sending message to Relevance AI: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    
    // API isteğini doğru endpoint'e gönder
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('API istekte kullanılan header bilgileri:', {
      'Content-Type': 'application/json',
      'Authorization': 'MASKED_FOR_SECURITY'
    });
    
    console.log('API isteği gövdesi:', JSON.stringify(requestBody, null, 2));
    
    // Check for HTTP errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Response Error Status: ${response.status}`);
      console.error(`API Response Error Text: ${errorText}`);
      throw new Error(`Relevance AI API error (${response.status}): ${errorText}`);
    }
    
    // Parse response
    const responseData = await response.json();
    console.log('API Response Data:', JSON.stringify(responseData, null, 2));
    console.log('Successfully sent message to Relevance AI:', responseData.conversation_id || 'No conversation ID');
    
    // Return structured response with conversation_id (used as messageId) and status
    return {
      conversation_id: responseData.conversation_id,
      thread_id: threadId,
      status: responseData.state || 'processing',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error sending message to Relevance AI:', error);
    throw error;
  }
}

/**
 * Webhook Callback Response Parser
 * @param {object} webhookData - Data received from webhook
 * @returns {object} - Parsed response object
 */
function parseWebhookResponse(webhookData) {
  if (!webhookData) {
    throw new Error('Webhook data is required');
  }
  
  console.log('Parsing webhook response data');
  
  // Check for various response formats and extract the response
  
  // Format 1: Direct response property
  if (webhookData.response) {
    return {
      text: webhookData.response,
      conversation_id: webhookData.conversation_id,
      thread_id: webhookData.thread_id
    };
  }
  
  // Format 2: Message content from results
  if (webhookData.results && webhookData.results.length > 0) {
    const messages = webhookData.results.filter(msg => 
      msg.content && msg.content.type === 'agent-message');
    
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      return {
        text: latestMessage.content.text,
        conversation_id: webhookData.conversation_id,
        thread_id: webhookData.thread_id
      };
    }
  }
  
  // Format 3: Output property with text
  if (webhookData.output) {
    return {
      text: webhookData.output.text || webhookData.output,
      conversation_id: webhookData.conversation_id,
      thread_id: webhookData.thread_id
    };
  }
  
  // Format 4: Task response
  if (webhookData.task && webhookData.task.response) {
    return {
      text: webhookData.task.response,
      conversation_id: webhookData.conversation_id,
      thread_id: webhookData.thread_id
    };
  }
  
  // If no recognizable format, return the raw data with additional debug info
  console.warn('Failed to parse webhook response:', JSON.stringify(webhookData, null, 2));
  
  // Attempt to extract any useful information from the raw data
  let extractedText = '';
  if (typeof webhookData === 'string') {
    extractedText = webhookData.substring(0, 100); // Take first 100 chars if it's a string
  } else if (webhookData.message) {
    extractedText = typeof webhookData.message === 'string' ? 
      webhookData.message : 'Found message property but not in expected format';
  } else if (webhookData.error) {
    extractedText = typeof webhookData.error === 'string' ? 
      `Error: ${webhookData.error}` : 'Error occurred but details not available';
  }
  
  return {
    raw: webhookData,
    text: extractedText || 'No response text could be extracted from the webhook data',
    status: 'unparsed',
    conversation_id: webhookData.conversation_id,
    thread_id: webhookData.thread_id
  };
}

module.exports = {
  sendMessageToRelevanceAI,
  parseWebhookResponse
};
