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
 * Send a message to the Relevance AI API with webhook callback support
 * @param {string} message - Message text to send
 * @param {string} agentId - Relevance AI Agent ID
 * @param {string} threadId - Thread ID for conversation tracking
 * @param {string} webhookUrl - URL for webhook callbacks when response is ready
 * @returns {Promise<object>} Response data
 */
async function sendMessageToRelevanceAI(message, agentId, threadId = null, webhookUrl = null) {
  try {
    if (!message) {
      throw new Error('Message is required');
    }
    
    if (!agentId) {
      throw new Error('Agent ID is required');
    }
    
    // API token from environment variables - AUTHENTICATION FORMAT FIX
    // Başarılı test gösterdi ki RAI_AUTH_TOKEN doğru formatta
    const authToken = process.env.RAI_AUTH_TOKEN;
    
    if (!authToken) {
      throw new Error('Authorization token is required. Set RAI_AUTH_TOKEN in .env file');
    }
    
    // Token formatı kontrolü - test-api.js'te bu format başarılı oldu
    console.log('Using auth token pattern:', authToken.includes(':') ? 'project:key format' : 'simple key format');
    
    // API endpoint for sending messages - correct endpoint from documentation
    const triggerEndpoint = `${RELEVANCE_API_BASE_URL}/agents/trigger`;
    console.log('Using API endpoint:', triggerEndpoint);
    
    // Request body with webhook support
    const requestBody = {
      message: {
        role: "user",
        content: message
      },
      agent_id: agentId
    };
    
    // Add thread_id for conversation tracking if provided
    if (threadId) {
      requestBody.thread_id = threadId;
      console.log(`Using thread ID: ${threadId}`);
    }
    
    // Add webhook configuration if URL is provided
    if (webhookUrl) {
      // URL'deki tüm noktalı virgülleri kaldır (potansiyel JSON hatası)
      const cleanWebhookUrl = webhookUrl.replace(/;/g, '');
      
      // Webhook yapılandırmasını ekle
      requestBody.webhook = {
        "url": cleanWebhookUrl,
        "include_thread_id": true  // Ensure thread_id is included in callbacks
      };
      
      console.log(`Using webhook callback URL: ${cleanWebhookUrl}`);
    }
    
    console.log(`Sending message to Relevance AI: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    console.log('Request endpoint:', triggerEndpoint);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    // Basitleştirilmiş API endpoint - test-api.js'te bu çalıştı
    const apiEndpoint = `https://api-${process.env.RAI_REGION}.stack.tryrelevance.com/latest/agents/trigger`;
    console.log('Using proven API endpoint:', apiEndpoint);
    
    // Başarılı test edilen API isteği
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken  // Test edilen başarılı token formatı
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
      webhook_url: webhookUrl,
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
  
  // If no recognizable format, return the raw data
  return {
    raw: webhookData,
    text: 'Could not parse response from webhook data',
    conversation_id: webhookData.conversation_id,
    thread_id: webhookData.thread_id
  };
}

module.exports = {
  sendMessageToRelevanceAI,
  parseWebhookResponse
};
