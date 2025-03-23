const HealthRecord = require('../models/HealthRecord');
const { parsePdfDocument, parseHandwrittenDocument, getMockPdfData, getMockHandwrittenData } = require('../services/documentAIService');
const { processHealthRecord, processTranscript } = require('../services/groqService');
const { uploadFileToS3, deleteFileFromS3 } = require('../services/s3Service');
const { initiateVerificationCall, getCallStatus, processCallTranscript } = require('../services/retellService');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

// Helper function to safely clean up a local file
const cleanupLocalFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`Cleaned up local file: ${filePath}`);
    } catch (err) {
      console.error(`Failed to clean up local file ${filePath}:`, err);
    }
  }
};

// @desc    Upload a health record (PDF or image)
// @route   POST /api/health-records/upload
// @access  Private
const uploadHealthRecord = async (req, res) => {
  let localFilePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Store the local file path for potential cleanup
    localFilePath = req.file.path;

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('Created uploads directory:', uploadsDir);
      } catch (dirErr) {
        console.error('Error creating uploads directory:', dirErr);
        return res.status(500).json({ message: 'Failed to create uploads directory' });
      }
    }

    // Make sure the file exists after multer processing
    if (!fs.existsSync(req.file.path)) {
      return res.status(400).json({ message: 'Uploaded file not found on server' });
    }

    const { title, description, documentType, patientName, patientPhone } = req.body;
    const userId = req.user._id;
    
    // Determine file extension
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let parsedData;
    let documentAISource = 'google'; // Track if we're using real or mock data
    
    console.log(`Processing file: ${req.file.path}, type: ${fileExtension}`);
    
    // Capture the processing timeline
    const processingTimeline = {
      documentAI: {
        startTime: new Date().toISOString(),
        endTime: null,
        source: documentAISource
      },
      verification: {
        startTime: null,
        endTime: null,
        status: 'not_initiated'
      },
      groqAI: {
        startTime: null,
        endTime: null,
        source: 'groq'
      },
      s3Upload: {
        startTime: null,
        endTime: null
      }
    };
    
    try {
      if (fileExtension === '.pdf') {
        // Process PDF document
        parsedData = await parsePdfDocument(req.file.path);
        console.log('PDF document processed successfully');
      } else if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
        // Process handwritten document (image)
        parsedData = await parseHandwrittenDocument(req.file.path);
        console.log('Image document processed successfully');
      } else {
        // Clean up the uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ 
          message: 'Unsupported file type. Please upload a PDF or image file.' 
        });
      }
      
      // Log Document AI results
      console.log('\n============ DOCUMENT AI RESULTS ============');
      console.log('Extracted Text:');
      console.log('---------------------------------------');
      // Print a preview of the text (limit to 500 chars for logging purposes)
      const previewText = parsedData.text.length > 500 
        ? parsedData.text.substring(0, 500) + '...' 
        : parsedData.text;
      console.log(previewText);
      console.log('---------------------------------------');
      
      if (parsedData.pages && parsedData.pages.length > 0) {
        console.log(`Number of pages: ${parsedData.pages.length}`);
        parsedData.pages.forEach((page, index) => {
          console.log(`Page ${page.pageNumber} preview: ${page.text.substring(0, 100)}...`);
        });
      }
      console.log('===========================================\n');
      
    } catch (parseError) {
      console.error('Document parsing error:', parseError);
      // Continue with mock data if parsing fails
      documentAISource = 'mock';
      if (fileExtension === '.pdf') {
        parsedData = getMockPdfData();
        console.log('Using mock PDF data due to Document AI error');
      } else {
        parsedData = getMockHandwrittenData();
        console.log('Using mock handwritten data due to Document AI error');
      }
    }
    
    // Document AI processing is done at this point
    processingTimeline.documentAI.endTime = new Date().toISOString();
    processingTimeline.documentAI.source = documentAISource;
    
    // Create a minimal health record first before making verification call
    // This allows us to have an ID to reference
    let healthRecord = await HealthRecord.create({
      user: userId,
      title: title || 'Untitled Health Record',
      description: description || '',
      documentType: documentType || 'Medical Report',
      patientName: patientName || '',
      patientPhone: patientPhone || '',
      extractedData: parsedData,
      processingMetadata: {
        fileInfo: {
          originalName: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
          extension: fileExtension
        },
        timeline: processingTimeline,
        extractedTextLength: parsedData.text.length,
        pageCount: parsedData.pages ? parsedData.pages.length : 0
      },
      processingStatus: 'document_ai_complete',
      verificationCall: {
        status: 'not_initiated'
      }
    });
    
    console.log(`Created initial health record with ID: ${healthRecord._id}`);
    
    // STEP 1: If patient phone is provided, initiate verification call IMMEDIATELY after Document AI
    let verificationResult = null;
    let verificationCallId = null;
    if (patientPhone && patientPhone.trim() !== '') {
      try {
        console.log('Initiating verification call to patient BEFORE GROQ processing...');
        processingTimeline.verification.startTime = new Date().toISOString();
        
        verificationResult = await initiateVerificationCall({
          patientName: patientName || 'Patient',
          patientPhone: patientPhone,
          documentType: documentType || 'Medical Report',
          documentId: healthRecord._id.toString(),
          extractedData: parsedData,
          // No structured data yet as GROQ hasn't run
        });
        
        verificationCallId = verificationResult.callId;
        
        // Update the health record with verification call info
        await HealthRecord.findByIdAndUpdate(healthRecord._id, {
          'verificationCall.callId': verificationResult.callId,
          'verificationCall.status': verificationResult.status,
          'verificationCall.startTime': new Date(verificationResult.startTime),
          'verificationCall.metadata': verificationResult.retellData,
          'processingStatus': 'verification_initiated'
        });
        
        processingTimeline.verification.status = verificationResult.status;
        
        console.log(`Verification call initiated with ID ${verificationResult.callId}`);
      } catch (verifyError) {
        console.error('Error initiating verification call:', verifyError);
        processingTimeline.verification.status = 'error';
        processingTimeline.verification.error = verifyError.message;
      }
    }
    
    // STEP 2: Poll the verification call until it ends or 3 minutes pass
    let callTranscript = null;
    let callTranscriptObject = null;
    let callRecordingUrl = null;
    let transcriptResult = null;
    let completeCallData = null;
    
    if (verificationCallId) {
      console.log('Waiting for verification call to complete (max 3 minutes)...');
      
      // Poll the call status for up to 3 minutes (180 seconds)
      const startTime = Date.now();
      const maxWaitTime = 3 * 60 * 1000; // 3 minutes in milliseconds
      let callEnded = false;
      let callStatus = null;
      
      while (!callEnded && (Date.now() - startTime) < maxWaitTime) {
        // Wait 5 seconds between checks
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          // Use the correct Retell API endpoint to get call data
          callStatus = await getCallStatus(verificationCallId);
          console.log(`Call status check: ${callStatus.status}`);
          
          if (['ended', 'error'].includes(callStatus.status)) {
            callEnded = true;
            console.log('Call has ended');
            completeCallData = callStatus; // Store the full call data
            
            // Only if we have transcript data, store it for later processing with GROQ
            if (callStatus.transcriptObject || callStatus.transcript) {
              console.log('Call transcript data retrieved, will be processed with GROQ after call');
              callTranscript = callStatus.transcript;
              callTranscriptObject = callStatus.transcriptObject;
              callRecordingUrl = callStatus.recordingUrl;
              
              // Update call status in the health record
              await HealthRecord.findByIdAndUpdate(healthRecord._id, {
                'verificationCall.endTime': callStatus.endTime ? new Date(callStatus.endTime) : new Date(),
                'verificationCall.status': callStatus.status,
                'verificationCall.transcript': callStatus.transcript,
                'verificationCall.transcriptObject': callStatus.transcriptObject,
                'verificationCall.recordingUrl': callStatus.recordingUrl,
                'processingStatus': 'verification_ended'
              });
            } else {
              console.log('Call ended but no transcript data available');
            }
          }
        } catch (statusError) {
          console.error('Error checking call status:', statusError);
          // Continue polling
        }
      }
      
      // If we hit the time limit and call is not ended
      if (!callEnded) {
        console.log('Reached 3-minute time limit for verification call');
        processingTimeline.verification.status = 'timeout';
        
        // Make one final attempt to get the call status
        try {
          callStatus = await getCallStatus(verificationCallId);
          completeCallData = callStatus; // Store even if not ended
          
          if (callStatus.transcriptObject || callStatus.transcript) {
            callTranscript = callStatus.transcript;
            callTranscriptObject = callStatus.transcriptObject;
            callRecordingUrl = callStatus.recordingUrl;
          }
        } catch (finalCheckError) {
          console.error('Error on final call status check:', finalCheckError);
        }
      }
    }
    
    // If verification timeline was started, set the end time
    if (processingTimeline.verification.startTime) {
      processingTimeline.verification.endTime = new Date().toISOString();
    }
    
    // STEP 3: Process with GROQ after verification call is complete
    console.log('Processing with GROQ after verification call completion...');
    
    // Set up context for GROQ
    const groqContext = {
      patientName: patientName || 'Not provided',
      patientPhone: patientPhone || 'Not provided',
      documentType: documentType || 'Medical Record',
      description: description || ''
    };
    
    // Start GROQ processing for document
    let structuredData;
    processingTimeline.groqAI.startTime = new Date().toISOString();
    
    try {
      structuredData = await processHealthRecord(parsedData, groqContext);
      
      // Log GROQ results
      console.log('\n============ GROQ AI RESULTS FOR DOCUMENT ============');
      console.log(JSON.stringify(structuredData, null, 2));
      console.log('====================================================\n');
    } catch (groqError) {
      console.error('Groq document processing error:', groqError);
      // Use a simple structured data if GROQ fails
      processingTimeline.groqAI.source = 'mock';
      structuredData = {
        patient: {
          name: patientName || 'Unknown Patient',
          phone: patientPhone || 'Not provided'
        },
        documentType: documentType || 'Medical Record',
        description: description || '',
        extractedText: parsedData.text || 'No text extracted',
        error: 'Failed to process with GROQ AI'
      };
      console.log('Using fallback structured data due to GROQ error');
    }
    
    // STEP 4: Process call transcript with GROQ if available
    if (callTranscriptObject || callTranscript) {
      console.log('Processing call transcript data with GROQ...');
      
      try {
        // Make sure we have the complete call data before processing
        if (!completeCallData) {
          completeCallData = {
            transcript: callTranscript,
            transcriptObject: callTranscriptObject,
            recordingUrl: callRecordingUrl,
            status: 'ended',
            metadata: {}
          };
        }
        
        // Process the transcript to extract corrections and feedback
        transcriptResult = await processCallTranscript(completeCallData);
        
        console.log('\n============ GROQ AI RESULTS FOR TRANSCRIPT ============');
        console.log(JSON.stringify(transcriptResult, null, 2));
        console.log('========================================================\n');
        
        // Apply corrections to the health record data
        if (transcriptResult.corrections && transcriptResult.corrections.length > 0) {
          console.log(`Applying ${transcriptResult.corrections.length} corrections from call verification`);
          
          for (const correction of transcriptResult.corrections) {
            if (correction.field && correction.correct) {
              // Apply critical corrections directly to the record
              if (['patientName', 'patientPhone'].includes(correction.field)) {
                // Update in the main record
                await HealthRecord.findByIdAndUpdate(healthRecord._id, {
                  [correction.field]: correction.correct
                });
                
                // Also update in structured data if it exists
                if (structuredData && structuredData.patient) {
                  if (correction.field === 'patientName') {
                    structuredData.patient.name = correction.correct;
                  } else if (correction.field === 'patientPhone') {
                    structuredData.patient.phone = correction.correct;
                  }
                }
              }
            }
          }
          
          // Update verification data with transcript results
          await HealthRecord.findByIdAndUpdate(healthRecord._id, {
            'verificationCall.verificationComplete': transcriptResult.verificationSuccessful || false,
            'verificationCall.corrections': transcriptResult.corrections || [],
            'verificationCall.additionalInfo': transcriptResult.additionalInfo || '',
            'verificationCall.summary': transcriptResult.transcriptAnalysis?.summary || '',
          });
        }
      } catch (transcriptError) {
        console.error('Error processing transcript with GROQ:', transcriptError);
      }
    } else {
      console.log('No transcript data available to process with GROQ');
    }
    
    // GROQ processing is done at this point
    processingTimeline.groqAI.endTime = new Date().toISOString();
    
    // STEP 5: Upload file to S3
    console.log('Uploading file to S3...');
    processingTimeline.s3Upload.startTime = new Date().toISOString();
    
    let fileUrl;
    try {
      fileUrl = await uploadFileToS3(
        req.file.path, 
        req.file.originalname, 
        req.file.mimetype
      );
      console.log('File uploaded to S3:', fileUrl);
      
      // Double-check that the local file was deleted by uploadFileToS3
      // If not (which shouldn't happen), delete it manually
      if (fs.existsSync(localFilePath)) {
        console.log('Local file still exists after S3 upload, deleting it now...');
        fs.unlinkSync(localFilePath);
      }
    } catch (s3Error) {
      console.error('Error uploading to S3, using local file instead:', s3Error);
      // Fallback to local file URL if S3 upload fails
      fileUrl = `/uploads/${path.basename(req.file.path)}`;
      console.log('Using local file URL:', fileUrl);
      // Don't delete the local file in this case as we need it
    }
    
    // S3 upload is done at this point
    processingTimeline.s3Upload.endTime = new Date().toISOString();
    
    // STEP 6: Update the complete record with all data
    await HealthRecord.findByIdAndUpdate(healthRecord._id, {
      structuredData: structuredData,
      fileUrl: fileUrl,
      filePath: fileUrl,
      'processingMetadata.timeline': processingTimeline,
      'processingMetadata.storageLocation': fileUrl.includes('amazonaws.com') ? 's3' : 'local',
      'processingStatus': transcriptResult ? 'verification_complete' : 'processing_complete'
    });
    
    // Get the updated record to return to the client
    healthRecord = await HealthRecord.findById(healthRecord._id);
    
    // Return a simplified response to avoid too much data in the initial response
    res.status(201).json({
      _id: healthRecord._id,
      title: healthRecord.title,
      description: healthRecord.description,
      documentType: healthRecord.documentType,
      patientName: healthRecord.patientName,
      patientPhone: healthRecord.patientPhone,
      fileUrl: healthRecord.fileUrl,
      extractedData: {
        text: parsedData.text.substring(0, 300) + (parsedData.text.length > 300 ? '...' : ''),
        pageCount: parsedData.pages ? parsedData.pages.length : 0
      },
      structuredData: structuredData,
      createdAt: healthRecord.createdAt,
      processingStatus: healthRecord.processingStatus,
      verificationCall: healthRecord.verificationCall ? {
        callId: healthRecord.verificationCall.callId,
        status: healthRecord.verificationCall.status,
        recordingUrl: healthRecord.verificationCall.recordingUrl
      } : null,
      // Include a message about detailed data availability
      message: "Full document data saved. Use the /api/health-records/:id/full endpoint to retrieve complete data."
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up the local file if it exists and an error occurred
    cleanupLocalFile(localFilePath);
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all health records for a user
// @route   GET /api/health-records
// @access  Private
const getUserHealthRecords = async (req, res) => {
  try {
    const healthRecords = await HealthRecord.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    // Return a simplified version to avoid large response sizes
    const simplifiedRecords = healthRecords.map(record => ({
      _id: record._id,
      title: record.title,
      description: record.description,
      documentType: record.documentType,
      patientName: record.patientName,
      patientPhone: record.patientPhone,
      fileUrl: record.fileUrl,
      createdAt: record.createdAt,
      // Include summary of extracted and structured data
      hasExtractedData: !!record.extractedData,
      hasStructuredData: !!record.structuredData,
      processingMetadata: record.processingMetadata
    }));

    res.json({ records: simplifiedRecords });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get a specific health record
// @route   GET /api/health-records/:id
// @access  Private
const getHealthRecordById = async (req, res) => {
  try {
    const healthRecord = await HealthRecord.findById(req.params.id);

    if (!healthRecord) {
      return res.status(404).json({ message: 'Health record not found' });
    }

    // Check if record belongs to user
    if (healthRecord.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this record' });
    }

    // Return a simplified version to avoid large response sizes
    const simplifiedRecord = {
      _id: healthRecord._id,
      title: healthRecord.title,
      description: healthRecord.description,
      documentType: healthRecord.documentType,
      patientName: healthRecord.patientName,
      patientPhone: healthRecord.patientPhone,
      fileUrl: healthRecord.fileUrl,
      createdAt: healthRecord.createdAt,
      // Include structured data but not the full extracted text
      structuredData: healthRecord.structuredData,
      // Include summary of extracted data
      extractedData: {
        hasText: !!healthRecord.extractedData?.text,
        textPreview: healthRecord.extractedData?.text 
          ? healthRecord.extractedData.text.substring(0, 300) + (healthRecord.extractedData.text.length > 300 ? '...' : '')
          : '',
        pageCount: healthRecord.extractedData?.pages?.length || 0
      },
      processingMetadata: healthRecord.processingMetadata
    };

    res.json({ record: simplifiedRecord });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get the full data for a specific health record
// @route   GET /api/health-records/:id/full
// @access  Private
const getFullHealthRecordById = async (req, res) => {
  try {
    const healthRecord = await HealthRecord.findById(req.params.id);

    if (!healthRecord) {
      return res.status(404).json({ message: 'Health record not found' });
    }

    // Check if record belongs to user
    if (healthRecord.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this record' });
    }

    // Return the complete record with all extracted and structured data
    res.json({ 
      record: {
        _id: healthRecord._id,
        title: healthRecord.title,
        description: healthRecord.description,
        documentType: healthRecord.documentType,
        patientName: healthRecord.patientName,
        patientPhone: healthRecord.patientPhone,
        fileUrl: healthRecord.fileUrl,
        createdAt: healthRecord.createdAt,
        // Include ALL data
        extractedData: healthRecord.extractedData,
        structuredData: healthRecord.structuredData,
        processingMetadata: healthRecord.processingMetadata
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete a health record
// @route   DELETE /api/health-records/:id
// @access  Private
const deleteHealthRecord = async (req, res) => {
  try {
    const healthRecord = await HealthRecord.findById(req.params.id);

    if (!healthRecord) {
      return res.status(404).json({ message: 'Health record not found' });
    }

    // Check if record belongs to user
    if (healthRecord.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this record' });
    }

    // If file is stored on S3, delete it
    if (healthRecord.fileUrl && healthRecord.fileUrl.includes('amazonaws.com')) {
      try {
        await deleteFileFromS3(healthRecord.fileUrl);
        console.log('File deleted from S3:', healthRecord.fileUrl);
      } catch (s3Error) {
        console.error('Error deleting file from S3:', s3Error);
        // Continue with record deletion even if S3 deletion fails
      }
    } 
    // If file is stored locally, attempt to delete it
    else if (healthRecord.filePath && fs.existsSync(healthRecord.filePath)) {
      cleanupLocalFile(healthRecord.filePath);
    }

    await healthRecord.deleteOne();

    res.json({ message: 'Health record removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Initiate a verification call for a health record
// @route   POST /api/health-records/:id/verify
// @access  Private
const initiateCallVerification = async (req, res) => {
  try {
    const healthRecord = await HealthRecord.findById(req.params.id);

    if (!healthRecord) {
      return res.status(404).json({ message: 'Health record not found' });
    }

    // Check if record belongs to user
    if (healthRecord.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this record' });
    }
    
    // Check if there's already an active verification
    if (healthRecord.verificationCall && 
        ['registered', 'ongoing'].includes(healthRecord.verificationCall.status)) {
      return res.status(400).json({ 
        message: 'A verification call is already in progress', 
        callId: healthRecord.verificationCall.callId,
        status: healthRecord.verificationCall.status
      });
    }
    
    // Check if patient phone is provided
    if (!healthRecord.patientPhone || healthRecord.patientPhone.trim() === '') {
      // Allow the API to provide a phone number
      const { patientPhone } = req.body;
      if (!patientPhone || patientPhone.trim() === '') {
        return res.status(400).json({ message: 'Patient phone number is required for verification' });
      }
      
      // Update the patient phone in the record
      healthRecord.patientPhone = patientPhone;
      await healthRecord.save();
    }
    
    // Initiate the verification call
    const verificationResult = await initiateVerificationCall({
      patientName: healthRecord.patientName || 'Patient',
      patientPhone: healthRecord.patientPhone,
      documentType: healthRecord.documentType,
      documentId: healthRecord._id.toString(),
      extractedData: healthRecord.extractedData,
      structuredData: healthRecord.structuredData
    });
    
    // Update the health record with verification call info
    await HealthRecord.findByIdAndUpdate(healthRecord._id, {
      'verificationCall.callId': verificationResult.callId,
      'verificationCall.status': verificationResult.status,
      'verificationCall.startTime': new Date(verificationResult.startTime),
      'verificationCall.metadata': verificationResult.retellData,
      'processingStatus': 'verification_initiated'
    });
    
    res.json({
      message: 'Verification call initiated successfully',
      callId: verificationResult.callId,
      status: verificationResult.status,
      startTime: verificationResult.startTime
    });
  } catch (error) {
    console.error('Error initiating verification call:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get the status of a verification call
// @route   GET /api/health-records/:id/verify/status
// @access  Private
const getCallVerificationStatus = async (req, res) => {
  try {
    const healthRecord = await HealthRecord.findById(req.params.id);

    if (!healthRecord) {
      return res.status(404).json({ message: 'Health record not found' });
    }

    // Check if record belongs to user
    if (healthRecord.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this record' });
    }
    
    // Check if verification has been initiated
    if (!healthRecord.verificationCall || !healthRecord.verificationCall.callId) {
      return res.status(404).json({ message: 'No verification call found for this record' });
    }
    
    // If the call is ongoing or registered, check the current status from Retell
    if (['registered', 'ongoing'].includes(healthRecord.verificationCall.status)) {
      try {
        const callStatus = await getCallStatus(healthRecord.verificationCall.callId);
        
        // If the call status has changed, update the record
        if (callStatus.status !== healthRecord.verificationCall.status) {
          const updateData = {
            'verificationCall.status': callStatus.status
          };
          
          // If the call has ended, process the transcript data
          if (callStatus.status === 'ended') {
            // Check if we have transcript_object or regular transcript
            if (callStatus.transcriptObject || callStatus.transcript) {
              // Process the transcript to extract corrections and feedback
              const transcriptResult = await processCallTranscript(callStatus);
              
              // Update verification data with transcript results
              Object.assign(updateData, {
                'verificationCall.endTime': callStatus.endTime ? new Date(callStatus.endTime) : new Date(),
                'verificationCall.transcript': callStatus.transcript || null,
                'verificationCall.transcriptObject': callStatus.transcriptObject || null,
                'verificationCall.recordingUrl': callStatus.recordingUrl || null,
                'verificationCall.verificationComplete': transcriptResult.verificationSuccessful || false,
                'verificationCall.corrections': transcriptResult.corrections || [],
                'verificationCall.additionalInfo': transcriptResult.additionalInfo || '',
                'verificationCall.summary': transcriptResult.transcriptAnalysis?.summary || '',
                'processingStatus': 'verification_complete'
              });
              
              // Apply corrections to the health record data
              if (transcriptResult.corrections && transcriptResult.corrections.length > 0) {
                for (const correction of transcriptResult.corrections) {
                  // Apply corrections to patient data fields
                  if (correction.field === 'patientName' || correction.field === 'patientPhone') {
                    updateData[correction.field] = correction.correct;
                  }
                  
                  // For other corrections, store them but don't automatically update structured data
                }
              }
              
              // If we got additional info, we might want to update the record description
              if (transcriptResult.additionalInfo && transcriptResult.additionalInfo.trim() !== '') {
                updateData.description = healthRecord.description 
                  ? `${healthRecord.description}\n\nAdditional info from verification: ${transcriptResult.additionalInfo}`
                  : `Additional info from verification: ${transcriptResult.additionalInfo}`;
              }
            } else {
              // No transcript data available, just mark the call as ended
              Object.assign(updateData, {
                'verificationCall.endTime': callStatus.endTime ? new Date(callStatus.endTime) : new Date(),
                'processingStatus': 'verification_ended_no_transcript'
              });
            }
          }
          
          // Update the health record
          await HealthRecord.findByIdAndUpdate(healthRecord._id, updateData);
          
          // Refresh the record data
          healthRecord.verificationCall.status = callStatus.status;
          if (updateData['verificationCall.transcript']) {
            healthRecord.verificationCall.transcript = updateData['verificationCall.transcript'];
          }
          if (updateData['verificationCall.transcriptObject']) {
            healthRecord.verificationCall.transcriptObject = updateData['verificationCall.transcriptObject'];
          }
          if (updateData['verificationCall.recordingUrl']) {
            healthRecord.verificationCall.recordingUrl = updateData['verificationCall.recordingUrl'];
          }
        }
      } catch (statusError) {
        console.error('Error getting call status:', statusError);
        // Continue with the existing data
      }
    }
    
    // Return the verification status
    res.json({
      callId: healthRecord.verificationCall.callId,
      status: healthRecord.verificationCall.status,
      startTime: healthRecord.verificationCall.startTime,
      endTime: healthRecord.verificationCall.endTime,
      verificationComplete: healthRecord.verificationCall.verificationComplete,
      hasTranscript: !!healthRecord.verificationCall.transcript,
      hasTranscriptObject: Array.isArray(healthRecord.verificationCall.transcriptObject) && 
                        healthRecord.verificationCall.transcriptObject.length > 0,
      corrections: healthRecord.verificationCall.corrections,
      additionalInfo: healthRecord.verificationCall.additionalInfo,
      summary: healthRecord.verificationCall.summary,
      recordingUrl: healthRecord.verificationCall.recordingUrl,
      processingStatus: healthRecord.processingStatus
    });
  } catch (error) {
    console.error('Error getting verification status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  uploadHealthRecord,
  getUserHealthRecords,
  getHealthRecordById,
  getFullHealthRecordById,
  deleteHealthRecord,
  initiateCallVerification,
  getCallVerificationStatus,
  cleanupLocalFile
}; 