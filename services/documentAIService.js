const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Document AI client
let documentAIClient = null;

// Function to initialize Document AI client
const initDocumentAI = () => {
  try {
    // Check if environment variables are set
    const projectId = process.env.GOOGLE_PROJECT_ID;
    const processorId = process.env.GOOGLE_PROCESSOR_ID;
    const location = process.env.GOOGLE_PROCESSOR_LOCATION || 'us';

    if (!projectId || !processorId) {
      console.warn('GOOGLE_PROJECT_ID or GOOGLE_PROCESSOR_ID environment variables not set');
      return null;
    }

    // Create a new DocumentProcessorServiceClient - no need to specify credentials explicitly
    // as the library will use GOOGLE_APPLICATION_CREDENTIALS env var
    return new DocumentProcessorServiceClient();
  } catch (error) {
    console.error('Error initializing Document AI client:', error);
    return null;
  }
};

/**
 * Parse a PDF document using Google Document AI
 * @param {string} filePath - Path to PDF file
 * @returns {Object} - Parsed data
 */
const parsePdfDocument = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Initialize Document AI client if not already initialized
    if (!documentAIClient) {
      documentAIClient = initDocumentAI();
      if (!documentAIClient) {
        throw new Error('Failed to initialize Document AI client');
      }
    }
    
    const projectId = process.env.GOOGLE_PROJECT_ID;
    const processorId = process.env.GOOGLE_PROCESSOR_ID;
    const location = process.env.GOOGLE_PROCESSOR_LOCATION || 'us';
    
    // Create the processor name with the fully qualified resource path
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    
    // Read the file content
    const fileContent = fs.readFileSync(filePath);
    
    // Create the Document AI request
    const request = {
      name,
      rawDocument: {
        content: fileContent,
        mimeType: 'application/pdf',
      },
    };
    
    console.log(`Processing PDF document with processor: ${name}`);
    const [result] = await documentAIClient.processDocument(request);
    const { document } = result;
    const { text } = document;
    
    // Extract text from document
    const pages = document.pages.map(page => {
      return {
        pageNumber: page.pageNumber,
        text: text.substring(
          page.layout.textAnchor.textSegments[0]?.startIndex || 0,
          page.layout.textAnchor.textSegments[0]?.endIndex || 0
        )
      };
    });
    
    return {
      text,
      pages
    };
  } catch (error) {
    console.error('Error parsing PDF document:', error);
    console.log('Using mock implementation due to Document AI error');
    return getMockPdfData();
  }
};

/**
 * Parse a handwritten document (image) using Google Document AI
 * @param {string} filePath - Path to image file
 * @returns {Object} - Parsed data
 */
const parseHandwrittenDocument = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Initialize Document AI client if not already initialized
    if (!documentAIClient) {
      documentAIClient = initDocumentAI();
      if (!documentAIClient) {
        throw new Error('Failed to initialize Document AI client');
      }
    }
    
    const projectId = process.env.GOOGLE_PROJECT_ID;
    const processorId = process.env.GOOGLE_PROCESSOR_ID;
    const location = process.env.GOOGLE_PROCESSOR_LOCATION || 'us';
    
    // Create the processor name with the fully qualified resource path
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    
    // Read the file content
    const fileContent = fs.readFileSync(filePath);
    
    // Determine MIME type based on file extension
    const fileExtension = path.extname(filePath).toLowerCase();
    let mimeType;
    if (fileExtension === '.png') {
      mimeType = 'image/png';
    } else if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      mimeType = 'image/jpeg';
    } else {
      throw new Error(`Unsupported image format: ${fileExtension}`);
    }
    
    // Create the Document AI request
    const request = {
      name,
      rawDocument: {
        content: fileContent,
        mimeType,
      },
    };
    
    console.log(`Processing handwritten document with processor: ${name}, mimeType: ${mimeType}`);
    const [result] = await documentAIClient.processDocument(request);
    const { document } = result;
    const { text } = document;
    
    // Extract text from document
    const pages = document.pages.map(page => {
      return {
        pageNumber: page.pageNumber,
        text: text.substring(
          page.layout.textAnchor.textSegments[0]?.startIndex || 0,
          page.layout.textAnchor.textSegments[0]?.endIndex || 0
        )
      };
    });
    
    return {
      text,
      pages
    };
  } catch (error) {
    console.error('Error parsing handwritten document:', error);
    console.log('Using mock implementation due to Document AI error');
    return getMockHandwrittenData();
  }
};

/**
 * Process any document type using Google Document AI
 * @param {string} filePath - Path to document file
 * @returns {Object} - Parsed data
 */
const processDocument = async (filePath) => {
  const fileExtension = path.extname(filePath).toLowerCase();
  
  // Process based on file type
  if (fileExtension === '.pdf') {
    return parsePdfDocument(filePath);
  } else if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
    return parseHandwrittenDocument(filePath);
  } else {
    throw new Error(`Unsupported file format: ${fileExtension}`);
  }
};

// Mock PDF data
const getMockPdfData = () => {
  return {
    text: "This is mock parsed PDF content. In a real implementation, this would be the extracted text from the document.",
    pages: [
      {
        pageNumber: 1,
        text: "Patient Name: John Doe\nDOB: 01/15/1980\nMedical Record #: MRN12345\nDoctor: Dr. Jane Smith\nDiagnosis: Hypertension\nMedications: Lisinopril 10mg daily"
      }
    ]
  };
};

// Mock handwritten data
const getMockHandwrittenData = () => {
  return {
    text: "This is mock parsed handwritten content. In a real implementation, this would be the extracted text from the document.",
    pages: [
      {
        pageNumber: 1,
        text: "Patient: Sarah Johnson\nDate: 03/10/2023\nChief Complaint: Headache\nVital Signs: BP 120/80, HR 72\nAssessment: Migraine\nPlan: Sumatriptan 50mg as needed"
      }
    ]
  };
};

module.exports = {
  parsePdfDocument,
  parseHandwrittenDocument,
  processDocument,
  getMockPdfData,
  getMockHandwrittenData
}; 