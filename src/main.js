// src/main.js
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
let isDownloading = false;

// Validate YouTube URL - NOW INCLUDES SHORTS
function validateYouTubeUrl(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/ // ADDED: Shorts support
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

// Save state to storage
function saveState() {
  if (currentVideoData) {
    chrome.storage.local.set({
      currentVideo: currentVideoData,
      isDownloading: isDownloading,
      downloadProgress: isDownloading ? {
        visible: !progressContainer.classList.contains('hidden'),
        width: progressFill.style.width,
        text: progressText.textContent
      } : null
    });
  }
}

// Restore state from storage
async function restoreState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['currentVideo', 'isDownloading', 'downloadProgress'], (result) => {
      if (result.currentVideo) {
        currentVideoData = result.currentVideo;
        isDownloading = result.isDownloading || false;
        
        // Restore UI
        urlInput.value = `https://www.youtube.com/watch?v=${currentVideoData.videoId}`;
        urlDisplay.value = urlInput.value;
        displayVideoInfo(currentVideoData);
        
        // Restore download progress if was downloading
        if (result.downloadProgress && result.downloadProgress.visible) {
          progressContainer.classList.remove('hidden');
          progressFill.style.width = result.downloadProgress.width;
          progressText.textContent = result.downloadProgress.text;
          downloadBtnMain.disabled = true;
          downloadBtnTop.disabled = true;
        }
      }
      resolve();
    });
  });
}

// Clear state
function clearState() {
  chrome.storage.local.remove(['currentVideo', 'isDownloading', 'downloadProgress']);
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

// Update progress UI
function updateProgress(width, text) {
  progressFill.style.width = width;
  progressText.textContent = text;
  saveState(); // Save progress state
}

// Download video
async function downloadVideo() {
  if (!currentVideoData || isDownloading) return;
  
  try {
    isDownloading = true;
    
    // Disable buttons
    downloadBtnMain.disabled = true;
    downloadBtnTop.disabled = true;
    
    // Show progress - START FROM 0%
    progressContainer.classList.remove('hidden');
    updateProgress('0%', 'Initializing...');
    
    // Small delay to show 0% state
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Progress updates with realistic timing
    updateProgress('20%', 'Preparing download...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    updateProgress('40%', 'Getting highest quality stream...');
    
    // Get stream URL
    const streamUrl = await getHighestQualityStream(currentVideoData.videoId);
    
    updateProgress('70%', 'Starting download...');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Clean filename
    const filename = `${currentVideoData.title.replace(/[^a-z0-9]/gi, '_')}.mp4`;
    
    updateProgress('85%', 'Initiating file transfer...');
    
    chrome.downloads.download({
      url: streamUrl,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }
      
      // Complete
      updateProgress('100%', 'Download started!');
      
      setTimeout(() => {
        // Reset everything back to initial state
        progressContainer.classList.add('hidden');
        progressFill.style.width = '0%';
        downloadBtnMain.disabled = false;
        downloadBtnTop.disabled = false;
        isDownloading = false;
        
        // Clear saved state
        clearState();
        currentVideoData = null;
        
        // Reset UI to initial state
        videoInfoState.classList.remove('active');
        initialState.classList.add('active');
        urlInput.value = '';
        urlDisplay.value = '';
        thumbnail.src = '';
        videoTitle.textContent = 'Loading...';
        videoDescription.textContent = 'Loading...';
      }, 2000);
    });
    
  } catch (error) {
    console.error('Download error:', error);
    showError(error.message || 'Failed to download video. Please try again.');
    progressContainer.classList.add('hidden');
    progressFill.style.width = '0%';
    downloadBtnMain.disabled = false;
    downloadBtnTop.disabled = false;
    isDownloading = false;
    saveState();
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
    
    // Save state
    saveState();
    
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

// Initialize: Restore previous state first, then check current tab
async function initialize() {
  // First restore any saved state
  await restoreState();
  
  // Then check if we're on a YouTube page and auto-fill (only if no saved state)
  if (!currentVideoData) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const videoId = getVideoId(tabs[0].url);
        if (videoId) {
          urlInput.value = tabs[0].url;
        }
      }
    });
  }
}

// Run initialization
initialize();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadComplete') {
    isDownloading = false;
    clearState();
  }
});