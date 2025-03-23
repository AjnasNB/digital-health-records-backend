# Google Document AI Setup Guide

This guide will walk you through the process of setting up Google Document AI for your Digital Health Records application.

## Prerequisites

- A Google Cloud Platform (GCP) account
- Billing enabled on your GCP account (Document AI may incur charges)

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown in the top navigation bar
3. Click "New Project"
4. Enter a name for your project and click "Create"
5. Once created, make note of your Project ID as you'll need it later

## Step 2: Enable the Document AI API

1. In the Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Document AI API"
3. Click on "Document AI API" in the search results
4. Click "Enable" to enable the API for your project

## Step 3: Create a Document AI Processor

1. In the Cloud Console, go to "Document AI" in the navigation menu
   - If you can't find it, search for "Document AI" in the search bar
2. Click "Create Processor"
3. Choose the appropriate processor type for your needs:
   - For medical documents, you might choose "Form Parser" or "General Document OCR"
   - For handwritten notes, choose "OCR Processor"
4. Enter a name for your processor
5. Select a region (e.g., "us" or "eu")
6. Click "Create"
7. Once created, copy the Processor ID as you'll need it later

## Step 4: Create a Service Account

1. In the Cloud Console, go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Enter a service account name and description
4. Click "Create and Continue"
5. Add the following roles:
   - "Document AI Editor" (or "Document AI Processor User" for minimal permissions)
   - "Storage Object Viewer" (if your documents are stored in Google Cloud Storage)
6. Click "Continue" and then "Done"

## Step 5: Create and Download Service Account Key

1. In the Service Accounts list, find the service account you just created
2. Click the three dots menu button in the "Actions" column
3. Click "Manage keys"
4. Click "Add Key" > "Create new key"
5. Select "JSON" as the key type
6. Click "Create"
7. The key file will be automatically downloaded to your computer
8. Save this file in a secure location within your project

## Step 6: Configure Your Application

1. Open your `.env` file in your Digital Health Records application
2. Update the following environment variables:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account-key.json
   GOOGLE_PROJECT_ID=your-project-id
   GOOGLE_PROCESSOR_ID=your-processor-id
   GOOGLE_PROCESSOR_LOCATION=us  # or whichever region you selected
   ```

## Step 7: Test Your Configuration

1. Run the Document AI example script to test your setup:
   ```
   npm run example:document-ai
   ```
2. If successful, you should see the parsed content from your test documents

## Troubleshooting

- **Authentication Errors**: Make sure the path to your service account key file is correct and the file is accessible
- **Permission Errors**: Verify that your service account has the necessary Document AI roles
- **Processor Not Found**: Check that your processor ID is correct and the processor is in the specified location
- **Quota Errors**: Check your Google Cloud Console to ensure you have not exceeded any quotas

## Next Steps

- Explore different processor types for specialized document parsing needs
- Consider setting up a processor for each type of document you need to parse
- Review the [Document AI documentation](https://cloud.google.com/document-ai/docs) for more advanced usage

## Security Considerations

- Keep your service account key secure and never commit it to version control
- Use environment variables to store your credentials
- Consider using Google Cloud Secret Manager for production environments 