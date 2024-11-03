const { S3Client, CreateBucketCommand, PutBucketTaggingCommand, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const REGION = "ap-southeast-2";
const bucketName = 'n12162841-files';
const qutUsername = 'n12162841@qut.edu.au';
const purpose = 'Assignment 2';

// Create S3 client
const s3Client = new S3Client({ region: REGION });

// Function to create an S3 bucket
const createBucket = async () => {
    try {
        const command = new CreateBucketCommand({ Bucket: bucketName });
        const response = await s3Client.send(command);
        console.log(`Bucket created successfully: ${response.Location}`);
    } catch (err) {
        if (err.name === 'BucketAlreadyOwnedByYou') {
            console.log("Bucket already exists.");
        } else {
            console.error("Error creating bucket:", err);
        }
    }
};

// Function to tag an S3 bucket
const tagBucket = async () => {
    const tagParams = {
        Bucket: bucketName,
        Tagging: {
            TagSet: [
                { Key: 'qut-username', Value: qutUsername },
                { Key: 'purpose', Value: purpose }
            ]
        }
    };
    try {
        const command = new PutBucketTaggingCommand(tagParams);
        const response = await s3Client.send(command);
        console.log("Bucket tagging successful:", response);
    } catch (err) {
        console.error("Error tagging bucket:", err);
    }
};

// Function to upload a file to S3
const uploadFile = async (fileName, fileContent) => {
    const params = {
        Bucket: bucketName,
        Key: fileName,
        Body: fileContent
    };
    try {
        const command = new PutObjectCommand(params);
        const response = await s3Client.send(command);
        console.log(`File uploaded successfully: ${fileName}`, response);
    } catch (err) {
        console.error("Error uploading file:", err);
    }
};

// Function to generate a pre-signed URL
const generatePresignedUrl = async (fileName) => {
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: fileName
    });
    try {
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        console.log(`Pre-signed URL generated for ${fileName}:`, url);
        return url;
    } catch (err) {
        console.error("Error generating pre-signed URL:", err);
    }
};

const listFiles = async (username, filetype) => {
    const prefix = `${username}/${filetype}/`;  // Specify the folder structure
    const params = {
        Bucket: bucketName,
        Prefix: prefix // Filter by username and filetype folder
    };

    try {
        const command = new ListObjectsV2Command(params);
        const response = await s3Client.send(command);
        const files = response.Contents ? response.Contents.map(item => item.Key) : [];
        console.log(`Files in ${prefix}:`, files);
        return files;
    } catch (err) {
        console.error("Error listing files:", err);
        throw err;
    }
};

module.exports = { createBucket, tagBucket, uploadFile, generatePresignedUrl, listFiles, bucketName, s3Client };
