const express = require("express");
const fs = require('fs');
const router = express.Router();
const { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");
const auth = require("../auth.js");
const path = require("path");
const CP = require("node:child_process");
const db = require('../database/db');
const { uploadFile, generatePresignedUrl, listFiles } = require("../database/s3"); 

const region = 'ap-southeast-2';
const userPoolId = 'ap-southeast-2_9Kw2Kzhl2';
const clientId = '25r8mkfj1fse8cnuatf5k5u26l';

const cognitoClient = new CognitoIdentityProviderClient({ region });

// GET Login page
router.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/login.html"));
  });
  
  // POST Login
  router.post("/login", async (req, res) => {
    const { username, password } = req.body;
  
    const loginParams = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    };
  
    try {
      const authResult = await cognitoClient.send(new InitiateAuthCommand(loginParams));
      const idToken = authResult.AuthenticationResult.IdToken;
  
      // Store the token in a cookie
      res.cookie("token", idToken, {
        httpOnly: true,
        sameSite: "Strict",
      });
  
      // Get Cognito user ID from token
      const payload = await auth.verifier.verify(idToken);
      const cognitoUserId = payload.sub;
  
      // Check if user exists in your database
      let userResult = await db.query('SELECT id FROM users WHERE cognito_user_id = $1', [cognitoUserId]);
  
      if (userResult.rows.length === 0) {
        // User doesn't exist, create a new one
        await db.query(
          `INSERT INTO users (cognito_user_id)
           VALUES ($1)`,
          [cognitoUserId]
        );
      }
  
      // Redirect to home page
      res.redirect("/");
    } catch (err) {
      console.error('Error during login:', err);
      res.status(400).json({ message: 'Login failed', error: err.message });
    }
});  

// Log out by deleting token cookie.  Redirect back to login.
router.get("/logout", auth.authenticateCookie, (req, res) => {
   console.log("Logout by user", req.user.username);
   res.clearCookie("token");
   res.redirect("/login");
});


// MP3 file upload
router.post("/upload", auth.authenticateCookie, async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ status: 'error', message: 'No files were uploaded.' });
    }

    const file = req.files.uploadFile;
    const username = req.user.username;
    const cognitoUserId = req.user.sub;
    const fileName = `${username}/mp3/${file.name}`;
    
    const fileSizeInBytes = file.size; // Get the file size in bytes
    const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024); // Convert to megabytes
    const fileSizeRounded = fileSizeInMegabytes.toFixed(2) + ' MB'; // Round to 2 decimal places


    try {
        // Upload the file to S3
        await uploadFile(fileName, file.data);

        //Get internal user ID from the databse
        const userResult = await db.query('SELECT id FROM users WHERE cognito_user_id = $1', [cognitoUserId]);
        const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

        if (!userId){
            throw new Error ('User not found in the database');
        }

        // Save metadata to the database
        await db.query(
            `INSERT INTO files (user_id, file_name, file_type, s3_key, file_size) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id`,
            [userId, file.name, 'MP3', fileName, fileSizeRounded]
        );

        res.json({ status: 'success', message: `File ${file.name} uploaded to S3 and saved to the database.` });
    } catch (err) {
        console.error('Error saving file to S3 or database:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});


// Image file upload
router.post("/upload-image", auth.authenticateCookie, async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0 || !req.files.uploadImage.mimetype.startsWith('image/')) {
        return res.status(400).json({ status: 'error', message: 'No image files were uploaded or the file is not an image.' });
    }

    const file = req.files.uploadImage;
    const username = req.user.username;
    const cognitoUserId = req.user.sub;
    const fileName = `${username}/images/${file.name}`; // Define the file path in S3
    const fileType = file.mimetype.split('/')[1]; // Get the specific file type (e.g., png, gif, jpeg)
    
    const fileSizeInBytes = file.size; // Get the file size in bytes
    const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024); // Convert to megabytes
    const fileSizeRounded = fileSizeInMegabytes.toFixed(2) + ' MB'; // Round to 2 decimal places


    try {
        // Upload the file to S3
        await uploadFile(fileName, file.data);

        // Get internal user ID from the database
        const userResult = await db.query('SELECT id FROM users WHERE cognito_user_id = $1', [cognitoUserId]);
        const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

        if (!userId) {
            throw new Error('User not found in the database.');
        }

        // Save metadata to the database
        await db.query(
            `INSERT INTO files (user_id, file_name, file_type, s3_key, file_size) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id`,
            [userId, file.name, fileType, fileName, fileSizeRounded]
        );

        res.json({ status: 'success', message: `Image ${file.name} uploaded to S3 and saved to the database.` });
    } catch (err) {
        console.error('Error saving image to S3 or database:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// List MP3 files for the logged-in user
router.get('/api/files/audio', auth.authenticateCookie, async (req, res) => {
    const cognitoUserId = req.user.sub; 

    try {
        // Get internal user ID
        const userResult = await db.query('SELECT id FROM users WHERE cognito_user_id = $1', [cognitoUserId]);
        const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

        if (!userId) {
            throw new Error('User not found in the database.');
        }

        // Query the database to get s3_keys for MP3 files belonging to the user
        const result = await db.query(
            `SELECT s3_key FROM files WHERE file_type = 'MP3' AND user_id = $1`,
            [userId]
        );

        const files = result.rows.map(row => row.s3_key);

        res.json(files);
    } catch (err) {
        console.error('Error retrieving MP3 files:', err);
        res.status(500).json({ error: 'Failed to retrieve audio files' });
    }
});



// List image files for the logged-in user
router.get('/api/files/images', auth.authenticateCookie, async (req, res) => {
    const cognitoUserId = req.user.sub; // Get Cognito user ID
    
    
    try {
        // Get internal user ID from the database
        const userResult = await db.query('SELECT id FROM users WHERE cognito_user_id = $1', [cognitoUserId]);
        const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

        if (!userId) {
            throw new Error('User not found in the database.');
        }

        // Query the database to get s3_keys for image files belonging to the user
        const result = await db.query(
            `SELECT s3_key FROM files WHERE file_type IN ('png', 'jpg', 'jpeg', 'gif') AND user_id = $1`,
            [userId]
        );

        const files = result.rows.map(row => row.s3_key); // Extract the s3_key from each row

        res.json(files); // Return the list of s3_keys to the frontend
    } catch (err) {
        console.error('Error retrieving image files:', err);
        res.status(500).json({ error: 'Failed to retrieve image files' });
    }
});



// List MP4 files from the database
router.get('/api/files/videos', auth.authenticateCookie, async (req, res) => {
    const cognitoUserId = req.user.sub; // Get Cognito user ID

    try {
        // Get internal user ID
        const userResult = await db.query('SELECT id FROM users WHERE cognito_user_id = $1', [cognitoUserId]);
        const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

        if (!userId) {
            throw new Error('User not found in the database.');
        }

        // Query the database to get s3_keys for MP3 files belonging to the user
        const result = await db.query(
            `SELECT s3_key FROM files WHERE file_type = 'MP4' AND user_id = $1`,
            [userId]
        );

        const files = result.rows.map(row => row.s3_key);

        res.json(files);
    } catch (err) {
        console.error('Error retrieving MP4 files:', err);
        res.status(500).json({ error: 'Failed to retrieve video files' });
    }
});

// Download a specific MP4 file via pre-signed URL
router.get('/download/video/:s3Key', auth.authenticateCookie, async (req, res) => {
    const s3Key = decodeURIComponent(req.params.s3Key);  // Get the full S3 key from the request
    const cognitoUserId = req.user.sub; // Get Cognito user ID

    try {
        // Get internal user ID
        const userResult = await db.query('SELECT id FROM users WHERE cognito_user_id = $1', [cognitoUserId]);
        const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

        if (!userId) {
            throw new Error('User not found in the database.');
        }

        // Check if the file belongs to the user
        const fileResult = await db.query(
            `SELECT * FROM files WHERE s3_key = $1 AND user_id = $2`,
            [s3Key, userId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(403).json({ message: 'You do not have permission to access this file.' });
        }

        // Generate the pre-signed URL
        const presignedUrl = await generatePresignedUrl(s3Key);
        res.json({ url: presignedUrl });
    } catch (err) {
        console.error('Error generating pre-signed URL:', err);
        res.status(500).json({ message: 'Failed to generate pre-signed URL' });
    }
});

// GET Sign-up page
router.get("/signup", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/signup.html"));
  });
  
  // POST Sign-up
  router.post("/signup", async (req, res) => {
    const { username, password, email } = req.body;
  
    const signUpParams = {
      ClientId: clientId,
      Username: username,
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email,
        },
      ],
    };
  
    try {
      await cognitoClient.send(new SignUpCommand(signUpParams));
      res.redirect('/confirm'); // Redirect to email confirmation page
    } catch (err) {
      console.error('Error during sign up:', err);
      res.status(400).json({ message: 'Sign up failed', error: err.message });
    }
});

// GET Confirmation page
router.get("/confirm", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/confirm.html"));
  });
  
  // POST Email Confirmation
  router.post("/confirm", async (req, res) => {
    const { username, code } = req.body;
  
    const confirmParams = {
      ClientId: clientId,
      Username: username,
      ConfirmationCode: code,
    };
  
    try {
      await cognitoClient.send(new ConfirmSignUpCommand(confirmParams));
      res.redirect('/login'); // Redirect to login page after successful confirmation
    } catch (err) {
      console.error('Error during confirmation:', err);
      res.status(400).json({ message: 'Confirmation failed', error: err.message });
    }
});
  

// Serve up static files if they exist in public directory, protected by authentication middleware
router.use("/", auth.authenticateCookie, express.static(path.join(__dirname, "../public")));

module.exports = router;
