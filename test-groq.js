const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.GROQ_API_KEY;
console.log('Using API key:', apiKey.substring(0, 10) + '...');

async function testGroqApi() {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: "Hello, please respond with just the word 'OK' if you can read this"
          }
        ],
        temperature: 0.2,
        max_tokens: 5
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    console.log('GROQ API Response:', response.data);
    return true;
  } catch (error) {
    console.error('GROQ API Error:', error.response?.data || error.message);
    return false;
  }
}

// Run the test
testGroqApi().then(success => {
  console.log('Test completed. Success:', success);
}); 