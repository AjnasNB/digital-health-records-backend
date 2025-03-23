/**
 * Document Scanning Utility for Single Files
 * 
 * This script scans a single document file using Google Document AI
 * and outputs the extracted text.
 * 
 * Usage: node scripts/scan-file.js <file-path>
 */

const fs = require('fs');
const path = require('path');
const { processDocument } = require('../services/documentAIService');

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

// Process a single file
async function processSingleFile(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return;
    }

    // Check if file type is supported
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      console.error(`Unsupported file type: ${ext}`);
      console.error(`Supported file types: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return;
    }

    console.log(`Processing file: ${filePath}`);
    
    // Process the document
    const result = await processDocument(filePath);
    
    // Output directory - next to the original file
    const outputDir = path.dirname(filePath);
    
    // Create output file
    const outputPath = path.join(outputDir, `${path.basename(filePath, ext)}_extracted.txt`);
    fs.writeFileSync(outputPath, result.text);
    
    console.log(`\nExtracted Text Summary:`);
    console.log('======================');
    console.log(result.text.substring(0, 300) + (result.text.length > 300 ? '...' : ''));
    console.log('======================');
    console.log(`\n✅ Full extracted text saved to: ${outputPath}`);
    
    // Also save page-by-page content if available
    if (result.pages && result.pages.length > 0) {
      console.log(`\nDocument contains ${result.pages.length} pages.`);
      
      const pagesDir = path.join(outputDir, `${path.basename(filePath, ext)}_pages`);
      fs.mkdirSync(pagesDir, { recursive: true });
      
      result.pages.forEach(page => {
        const pageOutputPath = path.join(pagesDir, `page_${page.pageNumber}.txt`);
        fs.writeFileSync(pageOutputPath, page.text);
      });
      
      console.log(`Page-by-page content saved to: ${pagesDir}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error processing file:', error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide a file path to scan.');
  console.error('Usage: node scripts/scan-file.js <file-path>');
  process.exit(1);
}

const filePath = args[0];

// Start processing
console.log(`Starting document scan for: ${filePath}`);
processSingleFile(filePath).catch(console.error); 