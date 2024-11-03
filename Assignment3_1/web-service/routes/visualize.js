const express = require('express');
const auth = require('../auth.js');
const db = require('../database/db');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const router = express.Router();

// Initialize SQS client
const sqsClient = new SQSClient({ region: 'ap-southeast-2' }); // Replace 'your-region' with your AWS region
const queueUrl = 'https://sqs.ap-southeast-2.amazonaws.com/901444280953/n12162841-mp3tomp4'; // Replace with your SQS queue URL

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

        // Construct the message payload
        const messagePayload = {
            filePath,
            backgroundImageName,
            username,
            userId,
            isTest: isTest || false
        };

        // Send message to SQS
        const command = new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(messagePayload)
        });

        const response = await sqsClient.send(command);
        console.log('Message sent to SQS:', response);

        res.status(200).json({
            message: 'Video processing initiated successfully!'
        });

    } catch (err) {
        console.error('Error during video processing initiation:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
});

module.exports = router;
