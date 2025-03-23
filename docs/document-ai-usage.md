# Google Document AI Integration Guide

This guide explains how to use the Document AI integration in the Digital Health Records application to process medical documents.

## Overview

The application uses Google Document AI to extract text from PDF files and images (JPG, JPEG, PNG). The extracted text is then processed by GROQ AI to structure the medical information into a standardized format.

## Configuration

To use Document AI, you need to configure the following environment variables in your `.env` file:

```
# Google Document AI Credentials
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PROCESSOR_ID=your-processor-id
GOOGLE_PROCESSOR_LOCATION=us
```

- `GOOGLE_APPLICATION_CREDENTIALS`: Path to your Google Cloud service account key file
- `GOOGLE_PROJECT_ID`: Your Google Cloud Project ID
- `GOOGLE_PROCESSOR_ID`: The ID of your Document AI processor (not the full resource path)
- `GOOGLE_PROCESSOR_LOCATION`: The location of your processor (usually 'us')

## Upload Process

When a file is uploaded through the application:

1. The file is saved to the `/uploads` directory
2. Document AI processes the file to extract text
3. The extracted text is sent to GROQ for structuring
4. Both the original text and structured data are saved in the database

## Standalone Document Scanning Tools

We've included two command-line tools for scanning documents outside of the web application:

### 1. Scan a Single File

To scan a single document file:

```bash
node scripts/scan-file.js path/to/your/document.pdf
```

This will:
- Extract text from the document
- Save the full text to `document_extracted.txt`
- Save individual pages to a `document_pages` directory

### 2. Batch Scan Multiple Files

To scan all supported documents in a directory:

```bash
node scripts/scan-documents.js path/to/directory
```

This will:
- Scan all PDF, JPG, JPEG, and PNG files in the directory
- Create an `extracted_text` subdirectory
- Save extracted text for each document

## Error Handling

If Document AI fails to process a file (due to credential issues, file format problems, etc.), the system will fall back to mock data to allow development and testing to continue.

## Debugging

If you encounter issues with Document AI processing:

1. Check your `.env` file for correct configuration
2. Verify that your Google credentials file is valid and accessible
3. Make sure your processor ID is correct and the processor is active
4. Check the server logs for specific error messages
5. Test with the standalone tools to isolate web application issues

## Processor Setup

If you need to create a new Document AI processor:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to Document AI
3. Create a new processor
   - For general documents: choose "Document OCR"
   - For medical forms: choose "Form Parser"
   - For handwritten notes: choose "Enterprise Document OCR"
4. Copy the processor ID (not the full resource name)
5. Update your `.env` file with the new processor ID 