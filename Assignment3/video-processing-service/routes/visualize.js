const express = require('express');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const auth = require('../auth.js');
const db = require('../database/db');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { uploadFile } = require('../database/s3');
const { s3Client, bucketName } = require('../database/s3');

const router = express.Router();

// Create a unique filename 
function generateUniqueFilename(directory, baseName, extension) {
    let fileName = `${baseName}${extension}`;
    let filePath = path.join(directory, fileName);
    let counter = 1;

    while (fs.existsSync(filePath)) {
        fileName = `${baseName}${counter}${extension}`;
        filePath = path.join(directory, fileName);
        counter++;
    }

    return fileName;
}

// Create a random filename for the testing script
function generateRandomFilename(extension) {
    const randomString = Math.random().toString(36).substring(2, 15);
    return `${randomString}${extension}`;
}

// Helper function to download a file from S3 and save it locally
const downloadFileFromS3 = async (s3Key, localFilePath) => {
    const command = new GetObjectCommand({
        Bucket: bucketName, 
        Key: s3Key,       
    });

    const data = await s3Client.send(command);
    const writeStream = fs.createWriteStream(localFilePath);
    data.Body.pipe(writeStream);
    return new Promise((resolve, reject) => {
        data.Body.on('error', reject);
        writeStream.on('finish', resolve);
    });
};


// Function to generate the video
function generateVideo(inputFilePath, username, backgroundImageName, userId, callback, onProgress = null, isTest = false) {
    const outputDir = path.join('/tmp', username); 
    const localMp3Path = path.join(outputDir, 'temp.mp3');
    const localImagePath = path.join(outputDir, 'temp_image');

    // S3 paths for input files
    const mp3S3Key = `${username}/mp3/${inputFilePath}`;
    const imageS3Key = `${username}/images/${backgroundImageName}`;

    // S3 path for output video
    const outputS3Key = `${username}/mp4/${path.basename(inputFilePath, '.mp3')}.mp4`;

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    let callbackCalled = false;

    Promise.all([
        downloadFileFromS3(mp3S3Key, localMp3Path),
        downloadFileFromS3(imageS3Key, localImagePath)
    ])
    .then(() => {
    // Generate a unique output filename or a random one if in test mode
    let outputFileName;
    if (isTest) {
        outputFileName = generateRandomFilename('.mp4');
    } else {
        outputFileName = generateUniqueFilename(outputDir, path.basename(localMp3Path, '.mp3'), '.mp4');
    }
    const finalOutputPath = path.join(outputDir, outputFileName);

    console.log('Input File Path:', localMp3Path);
    console.log('Background Image Path:', localImagePath);
    console.log('Final Output Path:', finalOutputPath);

    // Check if background is image or a gif
    const isGif = path.extname(localImagePath).toLowerCase() === '.gif';

    const ffmpegCommand = ffmpeg(localMp3Path);

    if (isGif) {
        // Used chatGPT to get the ffmpeg configuration
        ffmpegCommand.input(localImagePath)
            .inputOptions('-stream_loop', '-1')  // Loop the GIF infinitely
            .inputOptions('-filter_complex', `
                [1:v]scale=1280:720,setsar=1,format=rgba[bg];
                [0:a]showwaves=s=1280x720:mode=line:colors=blue[v];
                [bg][v]overlay=(W-w)/2:(H-h)/2[vout]
            `);
    } else {
        // Used chatGPT to get the ffmpeg configuration
        ffmpegCommand.input(localImagePath)
            .inputOptions('-filter_complex', `
                [1:v]scale=1280:720,setsar=1[bg];
                [0:a]showwaves=s=1280x720:mode=line:colors=blue[v];
                [bg][v]overlay=(W-w)/2:(H-h)/2[vout]
            `);
    }

    // Used chatGPT to get the ffmpeg configuration
    ffmpegCommand
        .outputOptions('-map', '[vout]')
        .outputOptions('-map', '0:a') // Map the original audio to the output
        .videoCodec('libx264')
        .outputOptions('-crf', '18') // Higher quality
        .audioCodec('aac') // Use AAC codec for the audio
        .outputOptions('-pix_fmt', 'yuv420p') // Ensure compatibility with QuickTime
        .outputOptions('-shortest') // Ensure video length matches the audio
        .outputOptions('-movflags', '+faststart') // Optimize for streaming
        .format('mp4')
        .output(finalOutputPath)
        .on('progress', function(progress) {
            console.log(`Processing: ${progress.percent}% done`);
            if (onProgress) onProgress(progress.percent);
        })
        .on('end', async function() {
            console.log('Final video with background created successfully:', finalOutputPath);
            
            try {
                // Read and upload the final MP4 video to S3
                const fileContent = fs.readFileSync(finalOutputPath);
                await uploadFile(outputS3Key, fileContent);

                // Get the file size
                const fileStats = fs.statSync(finalOutputPath);
                const fileSizeInBytes = fileStats.size; // File size in bytes
                const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024); // Convert to megabytes
                const fileSizeRounded = fileSizeInMegabytes.toFixed(2) + ' MB'; // Round to 2 decimal places


                // Save metadata for the MP4 to the database
                await db.query(
                    `INSERT INTO files (user_id, file_name, file_type, s3_key, file_size) 
                    VALUES ($1, $2, $3, $4, $5) 
                    RETURNING id`,
                    [userId ,path.basename(outputS3Key), 'MP4', outputS3Key, fileSizeRounded]
                );

                // Clean up temporary files
                fs.unlinkSync(localMp3Path);
                fs.unlinkSync(localImagePath);
                fs.unlinkSync(finalOutputPath);

                if(!callbackCalled) {
                    callbackCalled = true;
                    callback(null, outputS3Key);
                }
            } catch (err) {
                console.error('Error saving MP4 metadata to the database:', err);
                if(!callbackCalled) {
                    callbackCalled = true;
                    callback(err);
                }
            }
        })
        .on('error', function(err) {
            console.error('Error during video generation:', err);
            if (!callbackCalled) {
                callbackCalled = true;
                callback(err);
            }
        })
        .run();
})
.catch((err) => {
    console.error('Error downloading files from S3:', err);
    if (!callbackCalled) {
        callbackCalled = true;
        callback(err);
    }
});
}

// Route to handle video generation
router.post('/', auth.authenticateCookie, async (req, res) => {
    const { filePath, backgroundImageName, isTest } = req.body;
    const username = req.user.username;
    const cognitoUserId = req.user.sub;

    if (!filePath) {
        return res.status(400).json({ message: 'File path is required!' });
    }

    if (!backgroundImageName) {
        return res.status(400).json({ message: 'Background image name is required!' });
    }

    try {
        const userResult = await db.query('SELECT id FROM users WHERE cognito_user_id = $1', [cognitoUserId]);
        const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

        if (!userId) {
            throw new Error('User not found in the database.');
        }

        generateVideo(filePath, username, backgroundImageName, userId, (err, outputVideoPath) => {
        if (err) {
            return res.status(500).json({ message: 'Video generation failed', error: err });
        }

        res.status(200).json({
            message: 'Video created successfully!',
            videoPath: outputVideoPath
        });
    }, isTest);
    } catch (err) {
        console.error('Error during video generation:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message});
    }    
});

module.exports = router;
