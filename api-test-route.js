/**
 * API test router for Relevance AI integration
 */
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch'); // Direk fetch kullanımı için
const { sendMessageToRelevanceAI } = require('./relevance');

// Test endpoint for API connection - Başarılı formata göre yeniden düzenlendi
router.post('/test', async (req, res) => {
  try {
    console.log('Received API test request:', req.body);
    
    // Get message and agent ID from request
    const { message, agentId } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false,
        error: 'Message is required' 
      });
    }
    
    // Use provided agent ID or default from env
    const actualAgentId = agentId || process.env.AGENT_ID;
    
    if (!actualAgentId) {
      return res.status(400).json({
        success: false,
        error: 'Agent ID is required'
      });
    }
    
    console.log(`Testing API with message: ${message}`);
    console.log(`Using agent ID: ${actualAgentId}`);
    
    // Doğru endpoint: agents/trigger
    const RELEVANCE_API_BASE_URL = process.env.RELEVANCE_API_BASE_URL || 'https://api-d7b62b.stack.tryrelevance.com/latest';
    const triggerUrl = `${RELEVANCE_API_BASE_URL}/agents/trigger`;
    
    // Thread ID oluşturma
    const threadId = `thread_${Date.now()}_api_test`;
    
    // Webhook URL for callback (SERVER_URL must be set in .env)
    const serverUrl = process.env.SERVER_URL;
    if (!serverUrl) {
      console.warn('Warning: SERVER_URL is not set in environment variables. Webhook callbacks may not work.');
    }
    
    const webhookUrl = `${serverUrl}/api/relevance-webhook`;
    console.log('Using webhook callback URL:', webhookUrl);
    
    // Build the request body with webhook information
    const payload = {
      message: {
        role: "user",
        content: message
      },
      agent_id: actualAgentId,
      thread_id: threadId,
      // Add webhook information for callback
      webhook: {
        url: webhookUrl,
        include_thread_id: true
      }
    };
    
    console.log('Using Relevance AI agents/trigger endpoint:', triggerUrl);
    console.log('Thread ID for API test:', threadId);
    console.log('Request Payload:', JSON.stringify(payload, null, 2));
    
    // Agents/trigger endpoint kullanarak API isteği gönder
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.RAI_AUTH_TOKEN
      },
      body: JSON.stringify(payload)
    });
    
    console.log('API Yanıt Durumu:', response.status, response.statusText);
    
    // Önce ham yanıtı al
    const responseText = await response.text();
    console.log('Ham API yanıtı:', responseText.substring(0, 200) + '...');
    
    // JSON olarak çözümlemeyi dene
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: 'API yanıtı JSON formatında değil',
        rawResponse: responseText
      });
    }
    
    // Conversation ID kontrolü
    const conversationId = responseData.conversation_id;
    
    if (!conversationId) {
      return res.status(500).json({
        success: false,
        error: 'API yanıtında conversation_id bulunamadı',
        apiResponse: responseData
      });
    }
    
    // Başarılı ilk yanıtı döndür
    res.json({
      success: true,
      message: 'Relevance AI ile bağlantı başarılı!',
      conversationId: conversationId,
      apiResponse: responseData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing API test request:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while processing your request',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
