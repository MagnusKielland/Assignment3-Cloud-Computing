// Handle login
function handleLogin(event) {
    event.preventDefault(); // Prevent default form submission

    const form = event.target;
    const formData = new FormData(form);
    const username = formData.get('username');
    const password = formData.get('password');

    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => {
        if (response.ok) {
            window.location.href = '/'; // Redirect on successful login
        } else if (response.status === 403) {
            document.getElementById('error-message').textContent = 'Invalid username or password.';
        } else {
            document.getElementById('error-message').textContent = 'An error occurred. Please try again.';
        }
    })
    .catch(() => {
        document.getElementById('error-message').textContent = 'An error occurred. Please try again.';
    });
}

// Handle file uploads via AJAX
function handleUpload(event, formId, statusId, uploadUrl) {
    event.preventDefault(); // Prevent default form submission
    const form = document.getElementById(formId);
    const status = document.getElementById(statusId);
    const formData = new FormData(form);

    status.textContent = 'Uploading...';
    status.style.color = 'blue';

    fetch(uploadUrl, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            status.textContent = 'Upload successful!';
            status.style.color = 'green';

            // Refresh dropdowns after upload
            fetchFiles(); 
        } else {
            status.textContent = `Upload failed: ${data.message}`;
            status.style.color = 'red';
        }
    })
    .catch(error => {
        status.textContent = `An error occurred: ${error.message}`;
        status.style.color = 'red';
    });
}

// Fetch and populate audio files and images
async function fetchFiles() {
    const audioSelect = document.getElementById('selectedAudio');
    const imageSelect = document.getElementById('selectedImage');

    // Clear existing options
    audioSelect.innerHTML = '';
    imageSelect.innerHTML = '';

    // Fetch and populate audio files
    const audioResponse = await fetch('/api/files/audio');
    const audioFiles = await audioResponse.json();
    audioFiles.forEach(file => {
        const filename = file.split('/').pop(); // Extract the filename from the S3 key
        const option = document.createElement('option');
        option.value = filename;  // Only use the filename
        option.textContent = filename;  // Show only the filename
        audioSelect.appendChild(option);
    });

    // Fetch and populate image files
    const imageResponse = await fetch('/api/files/images');
    const imageFiles = await imageResponse.json();
    imageFiles.forEach(file => {
        const filename = file.split('/').pop();  // Extract the filename from the S3 key
        const option = document.createElement('option');
        option.value = filename;  // Only use the filename
        option.textContent = filename;  // Show only the filename
        imageSelect.appendChild(option);
    });
}


// Fetch and populate MP4 files
async function fetchVideos() {
    const videoSelect = document.getElementById('selectedVideo');

    // Clear existing options
    videoSelect.innerHTML = '';

    // Fetch and populate MP4 files
    const videoResponse = await fetch('/api/files/videos');
    const videoFiles = await videoResponse.json();

    videoFiles.forEach(s3Key => {
        const filename = s3Key.split('/').pop(); // Extract just the filename for display
        const option = document.createElement('option');
        option.value = s3Key;  // Store the full S3 key as the value
        option.textContent = filename;  // Display only the filename
        videoSelect.appendChild(option);
    });
}


// Download the selected video via pre-signed URL
function downloadVideo() {
    const videoSelect = document.getElementById('selectedVideo');
    const selectedS3Key = videoSelect.value;  // The full S3 key

    if (selectedS3Key) {
        fetch(`/download/video/${encodeURIComponent(selectedS3Key)}`)
            .then(response => response.json())
            .then(data => {
                // Redirect to the pre-signed URL to download the file
                if (data.url) {
                    window.location.href = data.url;
                }
            })
            .catch(err => {
                console.error('Error downloading video:', err);
            });
    }
}

// Handle video creation
function handleCreateVideo(event) {
    event.preventDefault();
    const form = document.getElementById('createVideoForm');
    const status = document.getElementById('videoCreationStatus');
    const formData = new FormData(form);

    status.textContent = 'Processing...';
    status.style.color = 'blue';

    fetch(form.action, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            status.textContent = data.message;
            status.style.color = 'green';

            //Refresh the MP4 dropdown after creating a video
            fetchVideos();
        } else {
            status.textContent = 'An error occurred: ' + data.error;
            status.style.color = 'red';
        }
    })
    .catch(error => {
        status.textContent = 'An error occurred: ' + error.message;
        status.style.color = 'red';
    });
}

// Load files and videos on page load
window.onload = () => {
    fetchFiles();
    fetchVideos();
};

function refreshFiles() {
    fetchFiles(); // Refresh audio and image files
    fetchVideos(); // Refresh video files
}
