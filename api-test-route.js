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
    
    // Direk API çağrısı - test-api.js'de çalışan yöntem
    const API_ENDPOINT = `https://api-${process.env.RAI_REGION}.stack.tryrelevance.com/latest/agents/trigger`;
    
    // Request body
    // Webhook URL oluşturma
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
    const webhookUrl = `${serverUrl}/api/relevance-webhook`;
    
    console.log(`Using webhook URL: ${webhookUrl}`);
    
    // Thread ID oluşturma
    const threadId = `thread_${Date.now()}_api_test`;
    
    const payload = {
      message: {
        role: "user",
        content: message
      },
      agent_id: actualAgentId,
      thread_id: threadId,
      webhook: {
        url: webhookUrl,
        include_thread_id: true
      }
    };
    
    console.log('API Endpoint:', API_ENDPOINT);
    console.log('Request Payload:', JSON.stringify(payload, null, 2));
    
    // Direkt fetch ile API isteği - test-api.js'de çalışan yöntem
    const response = await fetch(API_ENDPOINT, {
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
