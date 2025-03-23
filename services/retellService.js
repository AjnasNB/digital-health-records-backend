const axios = require('axios');

/**
 * Generates a prompt for verification call based on extracted document data
 * @param {Object} data Information about the document and patient
 * @returns {String} Generated prompt for Retell AI
 */
const generateVerificationPrompt = (data) => {
  const { patientName, patientPhone, documentType, extractedData } = data;
  
  // Create a brief summary of key information from the document
  let documentSummary = '';
  
  if (data.structuredData && Object.keys(data.structuredData).length > 0) {
    // If structured data is available, use that for a more organized summary
    const structuredData = data.structuredData;
    
    // Extract key information for verification
    const sections = [];
    
    if (structuredData.summary) {
      sections.push(`Document summary: ${structuredData.summary}`);
    }
    
    if (structuredData.diagnoses && structuredData.diagnoses.length > 0) {
      sections.push(`Diagnoses: ${structuredData.diagnoses.join(', ')}`);
    }
    
    if (structuredData.medications && structuredData.medications.length > 0) {
      const meds = structuredData.medications.map(med => {
        if (typeof med === 'object') {
          return Object.entries(med).map(([key, val]) => `${key}: ${val}`).join(', ');
        }
        return med;
      });
      sections.push(`Medications: ${meds.join('; ')}`);
    }
    
    if (structuredData.procedures && structuredData.procedures.length > 0) {
      sections.push(`Procedures: ${structuredData.procedures.join(', ')}`);
    }
    
    documentSummary = sections.join('\n');
  } else if (typeof extractedData === 'string') {
    // If only raw text is available, use a truncated version
    documentSummary = extractedData.substring(0, 500) + (extractedData.length > 500 ? '...' : '');
  } else if (extractedData.text) {
    // If extractedData has a text property, use that
    documentSummary = extractedData.text.substring(0, 500) + (extractedData.text.length > 500 ? '...' : '');
  }

  return `You are Luna, a healthcare verification assistant calling on behalf of Digital Health Records. 
  
  Your task is to verify patient information and document details with ${patientName} in a brief, professional call.
  
  IMPORTANT: Start by informing the patient that this call will automatically end after 3 minutes, so the verification needs to be completed quickly.
  
  Call Structure:
  1. Greet ${patientName}, identify yourself as Luna from Digital Health Records verification service, and IMMEDIATELY inform them this call will automatically end after 3 minutes
  2. Explain that you're calling to verify the digitization of their ${documentType || 'medical document'} and ensure the information is accurate
  3. Verify their name and confirm they are the correct patient
  4. Briefly summarize the key information extracted from their document and ask if it's accurate
  5. Ask if there are any corrections or additional information they would like to add
  6. Thank them for their time and explain that their feedback will help ensure their digital medical records are accurate
  
  Information to verify:
  - Patient Name: ${patientName || 'Not provided'}
  - Document Type: ${documentType || 'Medical document'}
  - Document Content: ${documentSummary}
  
  IMPORTANT GUIDELINES:
  - At the beginning of the call, clearly state: "This automated verification call will end after 3 minutes, so let's complete the verification quickly."
  - Be concise and professional
  - Focus only on verifying the information
  - Do not discuss treatment options or give medical advice
  - Protect patient privacy and confidentiality
  - Keep the call brief (under 3 minutes, as it will automatically disconnect)
  - If the patient says the information is incorrect, ask what the correct information is
  - Take note of all corrections mentioned by the patient
  
  Remember, this is a verification call only. If the patient has medical questions, politely explain that you're only calling to verify document information and they should contact their healthcare provider for medical advice.
  
  Periodically remind the patient of the remaining time if the call is taking longer than expected.`;
};

/**
 * Initiates a verification call to the patient
 * @param {Object} data Information about the document and patient
 * @returns {Promise<Object>} Call information including call ID
 */
const initiateVerificationCall = async (data) => {
  try {
    const { patientName, patientPhone } = data;
    
    if (!patientPhone) {
      throw new Error('Patient phone number is required for verification call');
    }
    
    console.log(`Initiating verification call to ${patientName} at ${patientPhone}`);
    
    // Step 1: Update the voice ID to Luna
    await axios({
      method: 'PATCH',
      url: `https://api.retellai.com/update-agent/${process.env.RETELL_AGENT_ID}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`
      },
      data: { 
        voice_id: process.env.RETELL_VOICE_LUNA
      }
    });
    
    // Step 2: Update the LLM prompt with verification script
    await axios({
      method: 'PATCH',
      url: `https://api.retellai.com/update-retell-llm/${process.env.RETELL_LLM_ID}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`
      },
      data: { 
        general_prompt: generateVerificationPrompt(data)
      }
    });
    
    // Step 3: STRICTLY set a 3-minute maximum call duration
    console.log('Setting strict 3-minute call duration limit');
    await axios({
      method: 'PATCH',
      url: `https://api.retellai.com/update-agent/${process.env.RETELL_AGENT_ID}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`
      },
      data: { 
        max_call_duration_ms: 3 * 60 * 1000 // Exactly 3 minutes
      }
    });
    
    // Step 4: Initiate the call
    const toNumber = patientPhone.startsWith('+') ? patientPhone : `+${patientPhone}`;
    
    const response = await axios({
      method: 'POST',
      url: 'https://api.retellai.com/v2/create-phone-call',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`
      },
      data: {
        from_number: process.env.RETELL_FROM_NUMBER,
        to_number: toNumber,
        agent_id: process.env.RETELL_AGENT_ID,
        metadata: {
          patientName,
          patientPhone,
          documentType: data.documentType,
          documentId: data.documentId || '',
          verificationType: 'medical_document',
          callPurpose: 'verification',
          maxDuration: '3 minutes'
        }
      }
    });
    
    console.log(`Verification call initiated with call_id: ${response.data.call_id}`);
    
    return {
      callId: response.data.call_id,
      status: response.data.call_status || 'registered',
      startTime: response.data.start_timestamp ? new Date(response.data.start_timestamp).toISOString() : new Date().toISOString(),
      retellData: response.data
    };
  } catch (error) {
    console.error('Error initiating verification call:', error);
    throw error;
  }
};

/**
 * Gets the status and details of a call
 * @param {String} callId The Retell call ID
 * @returns {Promise<Object>} Call status and details
 */
const getCallStatus = async (callId) => {
  try {
    if (!callId) {
      throw new Error('Call ID is required');
    }
    
    console.log(`Fetching call status for call ID: ${callId}`);
    
    // Use the correct endpoint to get call details
    const response = await axios({
      method: 'GET',
      url: `https://api.retellai.com/v2/get-call/${callId}`,
      headers: {
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`
      }
    });
    
    console.log(`Call status response: ${response.data.call_status}`);
    
    // Process response to extract all relevant data
    const result = {
      callId: response.data.call_id,
      status: response.data.call_status,
      startTime: response.data.start_timestamp ? new Date(response.data.start_timestamp).toISOString() : null,
      endTime: response.data.end_timestamp ? new Date(response.data.end_timestamp).toISOString() : null,
      callDuration: response.data.call_duration_ms ? response.data.call_duration_ms / 1000 : null,
      transcript: null,
      transcriptObject: null,
      recordingUrl: response.data.recording_url || null,
      callAnalysis: response.data.call_analysis || null,
      metadata: response.data.metadata || {},
      retellData: response.data
    };
    
    // Extract transcript if available
    // Transcripts are only available when calls have ended
    if (['ended', 'error'].includes(response.data.call_status)) {
      // Log the full response data structure when debugging
      console.log('Full response data keys:', Object.keys(response.data));
      
      // Check and extract transcript_object (structured conversation) - this is preferred
      if (response.data.transcript_object && Array.isArray(response.data.transcript_object)) {
        result.transcriptObject = response.data.transcript_object;
        console.log(`Transcript object available with ${result.transcriptObject.length} entries`);
        
        // Preview first few transcript entries
        if (result.transcriptObject.length > 0) {
          console.log('First transcript entry sample:');
          console.log(JSON.stringify(result.transcriptObject[0], null, 2));
        }
      }
      
      // Also extract regular transcript text if available as fallback
      if (response.data.transcript) {
        result.transcript = response.data.transcript;
        console.log(`Text transcript available, length: ${result.transcript.length} chars`);
      }
      
      // If no transcript is available in any format
      if (!result.transcriptObject && !result.transcript) {
        console.log(`No transcript available for call ${callId} despite ended status`);
        // Check if the call was too short
        if (result.callDuration && result.callDuration < 5) {
          console.log(`Call may have been too short (${result.callDuration}s) to generate transcript`);
        }
      }
      
      // Log availability of recording
      if (result.recordingUrl) {
        console.log(`Recording URL available: ${result.recordingUrl}`);
      } else {
        console.log('No recording URL available');
      }
    } else {
      console.log(`Call ${callId} is still in progress (${response.data.call_status}), no transcript yet`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error getting call status for call ID ${callId}:`, error);
    // Throw a more descriptive error
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Retell API error: ${errorMessage}`);
  }
};

/**
 * Processes call transcript to extract corrections and feedback
 * @param {Object} callData Call data from Retell API
 * @returns {Promise<Object>} Processed information from the call
 */
const processCallTranscript = async (callData) => {
  try {
    // Validate call data
    if (!callData) {
      console.log('No call data provided for processing');
      return { 
        success: false, 
        message: 'No call data available',
        verificationSuccessful: false,
        corrections: [],
        additionalInfo: ''
      };
    }
    
    // Check if we have transcript_object which is preferred over regular transcript
    if (!callData.transcriptObject && !callData.transcript) {
      console.log('No transcript or transcript_object provided for processing');
      return { 
        success: false, 
        message: 'No transcript data available',
        verificationSuccessful: false,
        corrections: [],
        additionalInfo: ''
      };
    }
    
    console.log('Processing call transcript with GROQ AI...');
    
    // The transcript contains the full conversation
    // We'll extract patient corrections and feedback using GROQ
    const { processTranscript } = require('./groqService');
    
    // Prepare metadata for transcript processing
    const metadataForGroq = {
      ...(callData.metadata || {}),
      callStatus: callData.status || 'unknown',
      callDuration: callData.callDuration || 0,
      hasRecording: !!callData.recordingUrl,
      transcriptType: callData.transcriptObject ? 'object' : 'text'
    };
    
    // We prefer using transcript_object if available as it contains more structured data
    // Format transcript object into a more readable format if available
    let transcriptForProcessing;
    
    if (callData.transcriptObject && Array.isArray(callData.transcriptObject)) {
      console.log(`Using transcript_object with ${callData.transcriptObject.length} entries for GROQ analysis`);
      
      // Format transcript_object into a readable conversation format
      transcriptForProcessing = callData.transcriptObject.map(entry => {
        const speaker = entry.role === 'agent' ? 'Luna' : 'Patient';
        return `${speaker}: ${entry.text}`;
      }).join('\n\n');
      
      // Log a preview of the formatted transcript
      console.log('Transcript preview (first 200 chars):');
      console.log(transcriptForProcessing.substring(0, 200) + '...');
    } else {
      // Fall back to regular transcript text
      console.log(`Using text transcript (${callData.transcript.length} chars) for GROQ analysis`);
      transcriptForProcessing = callData.transcript;
    }
    
    // Send transcript to GROQ for analysis
    console.log(`Sending transcript to GROQ for analysis (length: ${transcriptForProcessing.length})`);
    const result = await processTranscript(transcriptForProcessing, metadataForGroq);
    
    return {
      success: true,
      transcript: callData.transcript || transcriptForProcessing,
      transcriptObject: callData.transcriptObject || null,
      recordingUrl: callData.recordingUrl,
      transcriptAnalysis: result,
      callStatus: callData.status,
      corrections: result.corrections || [],
      additionalInfo: result.additionalInfo || '',
      sentiment: callData.callAnalysis?.user_sentiment || 'Neutral',
      verificationSuccessful: result.verificationSuccessful || 
                             callData.callAnalysis?.call_successful || 
                             false
    };
  } catch (error) {
    console.error('Error processing call transcript:', error);
    return {
      success: false,
      message: 'Failed to process transcript',
      error: error.message,
      verificationSuccessful: false,
      corrections: [],
      additionalInfo: ''
    };
  }
};

module.exports = {
  initiateVerificationCall,
  getCallStatus,
  processCallTranscript,
  generateVerificationPrompt
}; 