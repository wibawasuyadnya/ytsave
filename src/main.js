// DOM Elements
const initialState = document.getElementById('initial-state');
const videoInfoState = document.getElementById('video-info-state');
const urlInput = document.getElementById('url-input');
const urlDisplay = document.getElementById('url-display');
const downloadBtnTop = document.getElementById('download-btn-top');
const downloadBtnMain = document.getElementById('download-btn-main');
const thumbnail = document.getElementById('thumbnail');
const videoTitle = document.getElementById('video-title');
const videoDescription = document.getElementById('video-description');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');

let currentVideoData = null;

// Validate YouTube URL
function validateYouTubeUrl(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

// Extract video ID from URL
function getVideoId(url) {
  return validateYouTubeUrl(url);
}

// Show error
function showError(message) {
  errorMessage.classList.remove('hidden');
  errorText.textContent = message;
  setTimeout(() => {
    errorMessage.classList.add('hidden');
  }, 5000);
}

// Fetch video metadata
async function fetchVideoMetadata(videoId) {
  try {
    // Use YouTube oEmbed API for basic metadata
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch video metadata');
    }
    
    const data = await response.json();
    
    return {
      title: data.title,
      author: data.author_name,
      thumbnail: data.thumbnail_url,
      videoId: videoId
    };
  } catch (error) {
    console.error('Error fetching metadata:', error);
    throw error;
  }
}

// Display video information
function displayVideoInfo(data) {
  thumbnail.src = data.thumbnail;
  videoTitle.textContent = data.title;
  videoDescription.textContent = `By ${data.author}`;
  
  initialState.classList.remove('active');
  videoInfoState.classList.add('active');
}

// Get highest quality stream URL
async function getHighestQualityStream(videoId) {
  try {
    // Send message to background script to handle download
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { 
          action: 'getVideoStream', 
          videoId: videoId 
        },
        (response) => {
          if (response.success) {
            resolve(response.streamUrl);
          } else {
            reject(new Error(response.error || 'Failed to get video stream'));
          }
        }
      );
    });
  } catch (error) {
    console.error('Error getting stream:', error);
    throw error;
  }
}

// Download video
async function downloadVideo() {
  if (!currentVideoData) return;
  
  try {
    // Disable buttons
    downloadBtnMain.disabled = true;
    downloadBtnTop.disabled = true;
    
    // Show progress
    progressContainer.classList.remove('hidden');
    progressText.textContent = 'Preparing download...';
    progressFill.style.width = '30%';
    
    // Get stream URL
    progressText.textContent = 'Getting highest quality stream...';
    progressFill.style.width = '60%';
    
    const streamUrl = await getHighestQualityStream(currentVideoData.videoId);
    
    // Start download
    progressText.textContent = 'Starting download...';
    progressFill.style.width = '90%';
    
    // Clean filename
    const filename = `${currentVideoData.title.replace(/[^a-z0-9]/gi, '_')}.mp4`;
    
    chrome.downloads.download({
      url: streamUrl,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }
      
      // Complete
      progressFill.style.width = '100%';
      progressText.textContent = 'Download started!';
      
      setTimeout(() => {
        progressContainer.classList.add('hidden');
        progressFill.style.width = '0%';
        downloadBtnMain.disabled = false;
        downloadBtnTop.disabled = false;
      }, 2000);
    });
    
  } catch (error) {
    console.error('Download error:', error);
    showError(error.message || 'Failed to download video. Please try again.');
    progressContainer.classList.add('hidden');
    progressFill.style.width = '0%';
    downloadBtnMain.disabled = false;
    downloadBtnTop.disabled = false;
  }
}

// Handle URL input
async function handleUrlInput() {
  const url = urlInput.value.trim();
  
  if (!url) {
    showError('Please enter a YouTube URL');
    return;
  }
  
  const videoId = getVideoId(url);
  
  if (!videoId) {
    showError('Invalid or unsupported YouTube URL');
    return;
  }
  
  try {
    // Show loading state
    videoTitle.textContent = 'Loading...';
    videoDescription.textContent = 'Loading...';
    videoTitle.classList.add('loading');
    videoDescription.classList.add('loading');
    
    // Fetch metadata
    const metadata = await fetchVideoMetadata(videoId);
    currentVideoData = metadata;
    
    // Update URL display
    urlDisplay.value = url;
    
    // Display video info
    displayVideoInfo(metadata);
    
    // Remove loading state
    videoTitle.classList.remove('loading');
    videoDescription.classList.remove('loading');
    
  } catch (error) {
    console.error('Error:', error);
    showError('Failed to load video information. Please check the URL and try again.');
    videoTitle.classList.remove('loading');
    videoDescription.classList.remove('loading');
  }
}

// Event listeners
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleUrlInput();
  }
});

downloadBtnTop.addEventListener('click', handleUrlInput);
downloadBtnMain.addEventListener('click', downloadVideo);

// Check if we're on a YouTube page and auto-fill
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0] && tabs[0].url) {
    const videoId = getVideoId(tabs[0].url);
    if (videoId) {
      urlInput.value = tabs[0].url;
    }
  }
});