/**
 * Document AI Example Usage
 * 
 * This example demonstrates how to use Google Document AI to parse a PDF document.
 * Before running this example, make sure to set up your environment variables in the .env file:
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to your service account key JSON file
 * - GOOGLE_PROJECT_ID: Your Google Cloud Project ID
 * - GOOGLE_PROCESSOR_ID: Your Document AI Processor ID
 * - GOOGLE_PROCESSOR_LOCATION: Your Document AI Processor Location (default: us)
 */

const fs = require('fs');
const path = require('path');
const { parsePdfDocument, parseHandwrittenDocument } = require('../services/documentAIService');

// Path to a sample PDF file
const samplePdfPath = path.join(__dirname, 'sample-files', 'sample-medical-record.pdf');
// Path to a sample handwritten document image
const sampleHandwrittenPath = path.join(__dirname, 'sample-files', 'sample-handwritten-note.jpg');

// Create sample-files directory if it doesn't exist
const sampleDir = path.join(__dirname, 'sample-files');
if (!fs.existsSync(sampleDir)) {
  fs.mkdirSync(sampleDir, { recursive: true });
  console.log(`Created directory: ${sampleDir}`);
}

/**
 * Process a PDF document using Document AI
 */
const processPdfDocument = async () => {
  try {
    // Check if the sample PDF file exists
    if (!fs.existsSync(samplePdfPath)) {
      console.log(`Sample PDF file not found at ${samplePdfPath}`);
      console.log('Please place a sample PDF file at this location to test PDF processing.');
      return;
    }

    console.log('Processing PDF document...');
    const result = await parsePdfDocument(samplePdfPath);
    
    console.log('PDF Processing Results:');
    console.log('-----------------------');
    console.log(`Full Text: ${result.text.substring(0, 200)}...`);
    console.log('\nPages:');
    
    // Print each page's text
    result.pages.forEach((page, index) => {
      console.log(`\nPage ${page.pageNumber}:`);
      console.log(`${page.text.substring(0, 200)}...`);
    });
    
    // Save the results to a JSON file
    const outputPath = path.join(__dirname, 'output', 'pdf-processing-result.json');
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error processing PDF document:', error);
  }
};

/**
 * Process a handwritten document using Document AI
 */
const processHandwrittenDocument = async () => {
  try {
    // Check if the sample handwritten file exists
    if (!fs.existsSync(sampleHandwrittenPath)) {
      console.log(`Sample handwritten file not found at ${sampleHandwrittenPath}`);
      console.log('Please place a sample image file at this location to test handwritten processing.');
      return;
    }

    console.log('Processing handwritten document...');
    const result = await parseHandwrittenDocument(sampleHandwrittenPath);
    
    console.log('Handwritten Document Processing Results:');
    console.log('---------------------------------------');
    console.log(`Full Text: ${result.text.substring(0, 200)}...`);
    console.log('\nPages:');
    
    // Print each page's text
    result.pages.forEach((page, index) => {
      console.log(`\nPage ${page.pageNumber}:`);
      console.log(`${page.text.substring(0, 200)}...`);
    });
    
    // Save the results to a JSON file
    const outputPath = path.join(__dirname, 'output', 'handwritten-processing-result.json');
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error processing handwritten document:', error);
  }
};

// Run the examples
const runExamples = async () => {
  console.log('============================');
  console.log('Document AI Processing Examples');
  console.log('============================\n');
  
  // Process PDF
  await processPdfDocument();
  
  console.log('\n----------------------------\n');
  
  // Process handwritten document
  await processHandwrittenDocument();
};

// Run the examples
runExamples().then(() => {
  console.log('\nExamples completed.');
}).catch(error => {
  console.error('Error running examples:', error);
}); 