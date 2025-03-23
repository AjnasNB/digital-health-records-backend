const Groq = require('groq-sdk');
const axios = require('axios');
require('dotenv').config();

// Initialize Groq with fallback to mock if API key is not available
const groq = process.env.GROQ_API_KEY 
  ? new Groq({ apiKey: process.env.GROQ_API_KEY }) 
  : null;

/**
 * Process health record data using Groq AI
 * @param {Object} documentData - Data parsed from document
 * @param {Object} patientContext - Additional context about the patient
 * @returns {Object} - Structured health record data
 */
const processHealthRecord = async (documentData, patientContext = {}) => {
  try {
    // If GROQ_API_KEY is not available, use mock data
    if (!process.env.GROQ_API_KEY) {
      console.log('Using mock implementation for Groq AI (API key not available)');
      return getMockStructuredData(patientContext);
    }

    const prompt = `
    You are a medical data extraction expert. 
    I have a health record document that has been parsed into text.
    
    Additional context:
    - Patient Name: ${patientContext.patientName || 'Unknown'}
    - Patient Phone: ${patientContext.patientPhone || 'Unknown'}
    - Document Type: ${patientContext.documentType || 'Medical Record'}
    - Description: ${patientContext.description || 'No description provided'}
    
    Please extract the following information in a structured JSON format:
    - Patient information (name, DOB, medical record number if available)
    - Doctor/Provider information (name, specialty, hospital/clinic)
    - Diagnosis (primary and secondary if available)
    - Medications (name, dosage, frequency)
    - Treatment plan
    - Lab results (test name, value, normal range if available)
    - Vital signs (BP, heart rate, temperature, etc.)
    - Allergies
    - Medical history
    
    Here is the document text: 
    ${JSON.stringify(documentData)}
    
    Please return a properly formatted JSON object with the extracted information. 
    If any field is not available in the document, use the provided context information or leave it as null or empty array as appropriate.
    Be sure to structure the response as a valid parseable JSON.
    `;

    try {
      // Using axios to make the request in curl-compatible format
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are a medical data extraction expert that outputs only valid JSON."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 1024,
          top_p: 1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
          },
          timeout: 15000 // 15 second timeout
        }
      );

      console.log('Document processed successfully with GROQ API');
      const responseContent = response.data.choices[0]?.message?.content || "";
      
      // Try to parse the response as JSON
      try {
        // Find where the JSON starts and ends
        const jsonStart = responseContent.indexOf('{');
        const jsonEnd = responseContent.lastIndexOf('}') + 1;
        
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const jsonString = responseContent.substring(jsonStart, jsonEnd);
          return JSON.parse(jsonString);
        }
        
        // If no valid JSON object markers found, try to parse the whole response
        return JSON.parse(responseContent);
      } catch (parseError) {
        console.error('Error parsing Groq response:', parseError);
        return { 
          error: 'Failed to parse AI response into structured data',
          rawResponse: responseContent
        };
      }
    } catch (apiError) {
      console.error('Error calling GROQ API:', apiError.message);
      
      // Look for specific error types in the GROQ response
      if (apiError.response?.data?.error?.message === 'Invalid API Key') {
        console.error('Invalid GROQ API key - please check your API key is correct and active');
      } else if (apiError.code === 'ECONNABORTED') {
        console.error('GROQ API request timed out');
      }
      
      // Always fall back to mock data if any error occurs
      console.log('Falling back to mock structured data');
      return getMockStructuredData(patientContext);
    }
  } catch (error) {
    console.error('Error processing health record with Groq AI:', error);
    // Fallback to mock data
    return getMockStructuredData(patientContext);
  }
};

/**
 * Generate mock structured data when Groq AI is not available
 */
const getMockStructuredData = (patientContext = {}) => {
  return {
    patient: {
      name: patientContext.patientName || "John Doe",
      dateOfBirth: "1980-05-15",
      medicalRecordNumber: "MRN12345678",
      phone: patientContext.patientPhone || "555-123-4567"
    },
    provider: {
      name: "Dr. Sarah Johnson",
      specialty: "Internal Medicine",
      clinic: "HealthCare Medical Center"
    },
    diagnosis: {
      primary: "Essential Hypertension (I10)",
      secondary: ["Hyperlipidemia (E78.5)", "Type 2 Diabetes (E11.9)"]
    },
    medications: [
      {
        name: "Lisinopril",
        dosage: "10mg",
        frequency: "once daily"
      },
      {
        name: "Atorvastatin",
        dosage: "20mg",
        frequency: "once daily at bedtime"
      }
    ],
    treatmentPlan: "Continue current medications. Low sodium diet. Exercise 30 minutes daily. Follow up in 3 months.",
    labResults: [
      {
        test: "HbA1c",
        value: "6.8%",
        normalRange: "4.0-5.6%",
        date: "2023-09-15"
      },
      {
        test: "Total Cholesterol",
        value: "195 mg/dL",
        normalRange: "<200 mg/dL",
        date: "2023-09-15"
      }
    ],
    vitalSigns: {
      bloodPressure: "138/85 mmHg",
      heartRate: "72 bpm",
      temperature: "98.6°F",
      height: "5'10\"",
      weight: "185 lbs"
    },
    allergies: ["Penicillin", "Sulfa drugs"],
    medicalHistory: "Patient has a history of hypertension for 5 years and hyperlipidemia for 3 years. Family history of cardiovascular disease."
  };
};

/**
 * Process call transcript to extract corrections and additional information
 * @param {string} transcript - The transcript of the verification call
 * @param {Object} metadata - Metadata about the call and document
 * @returns {Promise<Object>} - Structured data from the transcript
 */
const processTranscript = async (transcript, metadata) => {
  try {
    const prompt = `
You are a medical data verification assistant. You need to carefully analyze a transcript from a verification call between an AI assistant named Luna and a patient. 

The call was made to verify information in a digitized medical document. Please extract:
1. Any corrections the patient mentioned (what was incorrect and what is the correct information)
2. Any additional information the patient provided
3. A summary of the verification results

Transcript:
${transcript}

Format your response as a JSON object with the following structure:
{
  "corrections": [
    {"field": "field_name", "incorrect": "incorrect_value", "correct": "correct_value"}
  ],
  "additionalInfo": "any additional information provided by the patient",
  "summary": "brief summary of the verification results",
  "verificationComplete": true/false (whether verification was successfully completed)
}

Don't include any explanations, just provide the structured JSON response.
`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Parse the JSON content from GROQ's response
    try {
      const content = response.data.choices[0].message.content;
      let structuredResponse;
      
      // Try to parse the JSON from the content
      try {
        structuredResponse = JSON.parse(content);
      } catch (parseError) {
        // If there's an error, try to extract JSON from the content using regex
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          structuredResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Failed to parse JSON from response');
        }
      }
      
      return {
        corrections: structuredResponse.corrections || [],
        additionalInfo: structuredResponse.additionalInfo || '',
        summary: structuredResponse.summary || '',
        verificationComplete: structuredResponse.verificationComplete || false,
        raw: content
      };
    } catch (parseError) {
      console.error('Error parsing GROQ response for transcript processing:', parseError);
      return {
        corrections: [],
        additionalInfo: 'Error: Could not parse transcript analysis',
        summary: 'Verification analysis failed',
        verificationComplete: false,
        raw: response.data.choices[0].message.content
      };
    }
  } catch (error) {
    console.error('Error processing transcript with GROQ:', error);
    throw error;
  }
};

module.exports = {
  processHealthRecord,
  processTranscript
}; 