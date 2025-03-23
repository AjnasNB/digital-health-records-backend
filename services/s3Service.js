const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

/**
 * Uploads a file to AWS S3
 * @param {string} filePath - Path to the file on the local file system
 * @param {string} originalFileName - Original name of the file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} - URL of the uploaded file
 */
const uploadFileToS3 = async (filePath, originalFileName, mimeType) => {
  try {
    // Make sure file exists before trying to read it
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist at path: ${filePath}`);
    }
    
    const fileContent = fs.readFileSync(filePath);
    const fileName = `${Date.now()}-${originalFileName.replace(/\s+/g, '-')}`;
    
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: fileContent,
      ContentType: mimeType,
      ACL: 'public-read', // Make the file publicly accessible
    };
    
    console.log(`Uploading file to S3 bucket: ${process.env.AWS_BUCKET_NAME}`);
    const uploadResult = await s3.upload(params).promise();
    console.log(`S3 upload successful: ${uploadResult.Location}`);
    
    // Delete the local file after successful upload
    try {
      console.log(`Deleting local file: ${filePath}`);
      fs.unlinkSync(filePath);
      console.log('Local file deleted successfully');
    } catch (deleteError) {
      console.error(`Error deleting local file: ${deleteError.message}`);
      // Continue execution even if file deletion fails
      // The controller will handle this case
    }
    
    return uploadResult.Location; // Return the URL of the uploaded file
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw error;
  }
};

/**
 * Deletes a file from AWS S3
 * @param {string} fileUrl - URL of the file to delete
 * @returns {Promise<void>}
 */
const deleteFileFromS3 = async (fileUrl) => {
  try {
    // Extract the key from the URL
    const key = fileUrl.split('/').pop();
    
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    };
    
    await s3.deleteObject(params).promise();
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    throw error;
  }
};

module.exports = {
  uploadFileToS3,
  deleteFileFromS3,
}; 