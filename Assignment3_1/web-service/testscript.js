const axios = require('axios');

//const url = 'http://localhost:3000';
const url = 'http://3.107.4.130:3000';

// Paths to the test files
const mp3FilePath = 'test.mp3';
const imageFilePath = 'test.jpg';

// Get an authentication token for the test user
const getAuthToken = async () => {
    try {
        const response = await axios.post(`${url}/api/login`, {
            username: 'test',
            password: 'test'
        });
        console.log('Auth Response:', response.data);
        return response.data.authToken;
    } catch (error) {
        console.error('Error getting auth token:', error);
    }
};

// Send a POST request to create a video
const createVideo = async (authToken, filePath, backgroundImageName, index) => {
    try {
        const response = await axios.post(`${url}/visualize`, {
            filePath: filePath,
            backgroundImageName: backgroundImageName,
            isTest: true // Use random filenames
        }, {
            headers: {
                'Cookie': `token=${authToken}`, // Send token as a cookie
                'Content-Type': 'application/json'
            },
            withCredentials: true // Ensure cookies are sent
        });

        console.log(`Request ${index + 1} result:`, response.data);
    } catch (error) {
        console.error(`Error in request ${index + 1}:`, error.response ? error.response.data : error.message);
    }
};

// Main function to run multiple simultaneous requests
const main = async () => {
    const authToken = await getAuthToken();
    console.log('Auth Token:', authToken);
    if (!authToken) {
        console.error('Failed to get auth token.');
        return;
    }

    // Create tasks for multiple simultaneous video requests
    const tasks = Array.from({ length: 2 }).map((_, index) =>
        createVideo(authToken, mp3FilePath, imageFilePath, index)
    );

    // Run all tasks simultaneously
    await Promise.all(tasks);
    console.log('All requests completed.');
};

// Execute the script
main();
