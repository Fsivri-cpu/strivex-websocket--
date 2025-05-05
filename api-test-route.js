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
    
    // Relevance AI webhook trigger URL'i
    const WEBHOOK_TRIGGER_URL = 'https://api-d7b62b.stack.tryrelevance.com/latest/agents/hooks/custom-trigger/36bc24de9987-4ada-be03-afd38ac895a1/d9bd72a6-2c8d-40c7-8f86-bcd9a41b1c9c';
    
    // Thread ID oluşturma - Relevance AI webhook trigger için hala gerekli
    const threadId = `thread_${Date.now()}_api_test`;
    
    // Güvenli payload oluştur - artık webhook URL'i gerektirmiyor
    const payload = {
      message: {
        role: "user",
        content: message
      },
      agent_id: actualAgentId,
      thread_id: threadId
    };
    
    console.log('Using Relevance AI Webhook Trigger URL');
    console.log('Thread ID for API test:', threadId);
    
    console.log('Webhook Trigger URL:', WEBHOOK_TRIGGER_URL);
    console.log('Request Payload:', JSON.stringify(payload, null, 2));
    
    // Webhook Trigger URL kullanarak API isteği gönder
    const response = await fetch(WEBHOOK_TRIGGER_URL, {
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
