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
 * Get job status from Relevance AI
 * 
 * @param {string} jobId - The job ID to check
 * @returns {Promise<Object>} - The job status
 */
async function getJobStatus(jobId) {
  try {
    if (!jobId) {
      throw new Error('Job ID is required');
    }

    const authToken = process.env.RAI_AUTH_TOKEN;
    if (!authToken) {
      throw new Error('RAI_AUTH_TOKEN environment variable is required');
    }

    // Relevance AI'da job status sorgulamak için doğru endpoint formatını kullanalım
    // Daha önce kullanıcı deneyimlerine göre job status API'si aşağıdaki formatta olmalı
    const jobUrl = `${RELEVANCE_API_BASE_URL}/agents/tasks/${jobId}/view`;
    console.log(`Checking job status at: ${jobUrl}`);

    const response = await fetch(jobUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Job status: ${data.status}, Job state: ${data.state || 'unknown'}`);
    return data;
  } catch (error) {
    console.error('Error getting job status:', error.message);
    throw error;
  }
}

/**
 * Poll for job status until completed
 * 
 * @param {string} jobId - The job ID to poll
 * @param {function} onComplete - Callback when job completes
 * @param {number} maxAttempts - Maximum number of polling attempts
 * @param {number} interval - Polling interval in milliseconds
 */
async function pollJobStatus(jobId, onComplete, maxAttempts = 10, interval = 6000) {
  console.log(`Starting job polling for job ID: ${jobId}`);
  let attempts = 0;

  const poll = async () => {
    try {
      attempts++;
      console.log(`Polling attempt ${attempts}/${maxAttempts} for job ${jobId}`);
      
      const jobData = await getJobStatus(jobId);
      
      // Job completed successfully
      if (jobData.state === 'completed' || jobData.status === 'completed') {
        console.log('Job completed, processing response');
        // Parse the response data, might be in different formats
        let responseText = '';
        
        if (jobData.output?.text) {
          responseText = jobData.output.text;
        } else if (jobData.response) {
          responseText = jobData.response;
        } else if (jobData.result) {
          responseText = typeof jobData.result === 'string' ? 
            jobData.result : JSON.stringify(jobData.result);
        } else if (jobData.content) {
          responseText = jobData.content;
        } else {
          responseText = 'Job completed, but no response text found';
        }
        
        onComplete({
          text: responseText,
          conversation_id: jobData.conversation_id,
          job_data: jobData
        });
        return;
      }
      
      // Job failed
      if (jobData.state === 'failed' || jobData.status === 'failed') {
        console.error('Job failed:', jobData.error || 'Unknown error');
        onComplete({
          text: `Error: ${jobData.error || 'Job failed'}`,
          error: true,
          job_data: jobData
        });
        return;
      }
      
      // Job still processing, continue polling
      if (attempts < maxAttempts) {
        setTimeout(poll, interval);
      } else {
        console.error('Max polling attempts reached');
        onComplete({
          text: 'Timeout: Job processing took too long',
          error: true,
          job_data: jobData
        });
      }
    } catch (error) {
      console.error('Error polling job status:', error);
      onComplete({
        text: `Polling error: ${error.message}`,
        error: true
      });
    }
  };
  
  // Start polling
  poll();
}

/**
 * Send a message to the Relevance AI API using the correct agents/trigger endpoint
 * @param {string} message - Message text to send
 * @param {string} agentId - Relevance AI Agent ID
 * @param {string} threadId - Thread ID for conversation tracking
 * @param {function} socketCallback - Optional callback to send events to the socket
 * @returns {Promise<object>} Response data
 */
async function sendMessageToRelevanceAI(message, agentId, threadId = null, socketCallback = null) {
  try {
    if (!message) {
      throw new Error('Message is required');
    }

    // Authorize correctly using the API Key format Relevance AI requires
    const authToken = process.env.RAI_AUTH_TOKEN;
    if (!authToken) {
      throw new Error('RAI_AUTH_TOKEN environment variable is required for Relevance AI API calls');
    }
    
    // Check token format and log a clear warning if it might be incorrect
    const isProjectFormat = authToken.includes(':');
    console.log(`Using auth token pattern: ${isProjectFormat ? 'project:key format' : 'simple key format'}`);
    
    if (!isProjectFormat) {
      console.warn('WARNING: Your RAI_AUTH_TOKEN may not be in the correct format. Some Relevance AI plans require "project:PROJECT_ID:KEY" format.');
    }

    // Doğru endpoint: agents/trigger
    const triggerUrl = `${RELEVANCE_API_BASE_URL}/agents/trigger`;
    console.log('Using Relevance AI agents/trigger endpoint:', triggerUrl);
    
    // Webhook URL for callback (SERVER_URL must be set in .env)
    const serverUrl = process.env.SERVER_URL;
    if (!serverUrl) {
      throw new Error('SERVER_URL environment variable is required for webhook callbacks');
    }
    
    // URL'yi tamamen temizle, hiçbir şekilde semicolon kalmamalı
    let cleanServerUrl = serverUrl.trim();
    
    // Tüm noktalı virgülleri kaldıralım
    cleanServerUrl = cleanServerUrl.split(';').join('');
    
    // Whitespace ve tırnak işaretlerini kaldır
    cleanServerUrl = cleanServerUrl.replace(/\s+/g, '').replace(/["']/g, '');
    
    // Slash ile bitiyorsa, fazladan slash eklenmesini önleyelim
    const baseUrl = cleanServerUrl.endsWith('/') ? cleanServerUrl.slice(0, -1) : cleanServerUrl;
    
    // Temiz URL'yi tamamen yeniden oluşturalım
    const webhookUrl = baseUrl + '/api/relevance-webhook';
    console.log('Using webhook callback URL:', webhookUrl);

    // Yeni bir request objesi oluşturalım
    const requestBody = {
      message: {
        role: "user",
        content: message
      },
      agent_id: agentId
    };
    
    // Webhook bilgilerini kesinlikle temiz bir şekilde ekleyelim
    requestBody.webhook = {
      url: webhookUrl,
      include_thread_id: true
    };
    
    // İhtiyaç olabilecek diğer callback formatları
    requestBody.webhook_url = webhookUrl;
    requestBody.callback_url = webhookUrl;
    requestBody.callbackUrl = webhookUrl;
    requestBody.callback = {
      url: webhookUrl
    };
    
    // Kontrol amaçlı webhook URL'yi bir daha yazdıralım
    console.log('Final webhook URL (sanitized):', webhookUrl);

    // Add thread_id for conversation tracking if provided
    if (threadId) {
      requestBody.thread_id = threadId;
      console.log(`Using thread ID: ${threadId}`);
    }

    console.log(`Sending message to Relevance AI: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    
    // Özel bir body json string oluşturalım
    // Bu şekilde kontrollü bir şekilde string inşa edeceğiz
    const cleanWebhookUrl = webhookUrl.split(';').join(''); // Son kez emin olalım
    
    // Tamamen manual olarak JSON oluşturalım, hiçbir escape karakteri olmasın
    const requestBodyJSON = `{
      "message": {
        "role": "user",
        "content": ${JSON.stringify(message)}
      },
      "agent_id": "${agentId}",
      "webhook": {
        "url": "${cleanWebhookUrl}",
        "include_thread_id": true
      },
      "webhook_url": "${cleanWebhookUrl}",
      "callback_url": "${cleanWebhookUrl}",
      "callbackUrl": "${cleanWebhookUrl}",
      "callback": {
        "url": "${cleanWebhookUrl}"
      }${threadId ? `,
      "thread_id": "${threadId}"` : ''}
    }`;
    
    // String olarak JSON içeriğini kontrol edelim
    console.log('Manual JSON request body (ilk 200 karakter):', requestBodyJSON.substring(0, 200) + '...');
    
    // API isteğini doğru endpoint'e gönder - manuel JSON stringi kullan
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      },
      body: requestBodyJSON
    });
    
    console.log('API istekte kullanılan header bilgileri:', {
      'Content-Type': 'application/json',
      'Authorization': 'MASKED_FOR_SECURITY'
    });
    
    // Parse the manual JSON string to log it in a formatted way
    try {
      const parsedBody = JSON.parse(requestBodyJSON);
      console.log('API isteği gövdesi:', JSON.stringify(parsedBody, null, 2));
    } catch (e) {
      console.log('API isteği gövdesi (raw):', requestBodyJSON);
    }
    
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
    
    // Job ID ve webhook yedekleme mekanizması
    const jobId = responseData.job_info?.job_id;
    const conversationId = responseData.conversation_id;
    
    if (jobId && socketCallback) {
      console.log(`Setting up backup polling for job ID: ${jobId} - Will poll if webhook doesn't arrive`);
      
      // 10 saniye sonra webhook hala gelmezse polling başlat
      setTimeout(() => {
        console.log(`Webhook timeout for job ${jobId}, starting polling fallback...`);
        
        // Polling başlamadan önce socket'e işlem başladı bilgisi gönder
        socketCallback('processing', {
          messageId: 'polling-' + jobId,
          message: 'Webhook not received, starting polling fallback...'
        });
        
        // Job durumunu pollayarak sonucu al
        pollJobStatus(jobId, (result) => {
          if (result.error) {
            socketCallback('error', {
              message: result.text,
              error: result.error
            });
          } else {
            socketCallback('reply', {
              response: result.text,
              conversationId: result.conversation_id || conversationId,
              timestamp: new Date().toISOString()
            });
          }
        }, 10, 6000); // 10 deneme, 6 saniye arayla (toplam 1 dakika)
      }, 10000); // 10 saniye webhook için bekle
    }
    
    // Return structured response with conversation_id (used as messageId) and status
    return {
      conversation_id: responseData.conversation_id,
      thread_id: threadId,
      job_id: jobId,
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
  
  // Format 5: content property (yeni API versiyon)
  if (webhookData.content) {
    return {
      text: typeof webhookData.content === 'string' ? webhookData.content : JSON.stringify(webhookData.content),
      conversation_id: webhookData.conversation_id || webhookData.thread_id,
      thread_id: webhookData.thread_id
    };
  }

  // Format 6: data.content property (nested response)
  if (webhookData.data && webhookData.data.content) {
    return {
      text: typeof webhookData.data.content === 'string' ? webhookData.data.content : JSON.stringify(webhookData.data.content),
      conversation_id: webhookData.data.conversation_id || webhookData.thread_id,
      thread_id: webhookData.thread_id
    };
  }
  
  // Diğer olası formatlar
  if (typeof webhookData === 'string') {
    extractedText = webhookData.substring(0, 100); // Take first 100 chars if it's a string
  } else if (webhookData.message) {
    extractedText = typeof webhookData.message === 'string' ? 
      webhookData.message : 'Found message property but not in expected format';
  } else if (webhookData.error) {
    extractedText = typeof webhookData.error === 'string' ? 
      `Error: ${webhookData.error}` : 'Error occurred but details not available';
  } else if (webhookData.job_info && webhookData.job_info.status === 'failed') {
    extractedText = `Job failed: ${webhookData.job_info.error || 'Unknown error'}`;
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
