/**
 * Document Scanning Utility
 * 
 * This script scans all supported document files in a directory using Google Document AI
 * and outputs the extracted text to individual text files.
 * 
 * Usage: node scripts/scan-documents.js <directory-path>
 */

const fs = require('fs');
const path = require('path');
const { processDocument } = require('../services/documentAIService');

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

// Process all files in a directory
async function processDirectory(dirPath) {
  try {
    // Create output directory if it doesn't exist
    const outputDir = path.join(dirPath, 'extracted_text');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get all files in the directory
    const files = fs.readdirSync(dirPath);
    
    console.log(`Found ${files.length} files in directory. Scanning for supported documents...`);
    
    // Filter for supported file types
    const supportedFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext);
    });
    
    console.log(`Found ${supportedFiles.length} supported documents to process.`);
    
    // Process each file
    for (let i = 0; i < supportedFiles.length; i++) {
      const file = supportedFiles[i];
      const filePath = path.join(dirPath, file);
      
      console.log(`[${i+1}/${supportedFiles.length}] Processing: ${file}`);
      
      try {
        // Process the document
        const result = await processDocument(filePath);
        
        // Create output file
        const outputPath = path.join(outputDir, `${path.basename(file, path.extname(file))}.txt`);
        fs.writeFileSync(outputPath, result.text);
        
        console.log(`✅ Extracted text saved to: ${outputPath}`);
        
        // Also save page-by-page content if available
        if (result.pages && result.pages.length > 0) {
          const pagesDir = path.join(outputDir, `${path.basename(file, path.extname(file))}_pages`);
          fs.mkdirSync(pagesDir, { recursive: true });
          
          result.pages.forEach(page => {
            const pageOutputPath = path.join(pagesDir, `page_${page.pageNumber}.txt`);
            fs.writeFileSync(pageOutputPath, page.text);
          });
          
          console.log(`   Page-by-page content saved to: ${pagesDir}`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${file}:`, error.message);
      }
    }
    
    console.log('\nProcessing complete!');
    console.log(`Processed ${supportedFiles.length} files. Results saved to: ${outputDir}`);
  } catch (error) {
    console.error('Error processing directory:', error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide a directory path to scan.');
  console.error('Usage: node scripts/scan-documents.js <directory-path>');
  process.exit(1);
}

const dirPath = args[0];

// Validate directory
if (!fs.existsSync(dirPath)) {
  console.error(`Directory not found: ${dirPath}`);
  process.exit(1);
}

if (!fs.statSync(dirPath).isDirectory()) {
  console.error(`Not a directory: ${dirPath}`);
  process.exit(1);
}

// Start processing
console.log(`Starting document scanning for directory: ${dirPath}`);
processDirectory(dirPath).catch(console.error); 