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

// Validate YouTube URL - INCLUDES SHORTS
function validateYouTubeUrl(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
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

// Fetch video metadata using YouTube Data API v3
async function fetchVideoMetadata(videoId) {
  try {
    const API_KEY = 'AIzaSyC47UnEKiZukx3vbyeImrez71-hKxob0V4';
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch video metadata');
    }
    
    const data = await response.json();
    
    // Check if video exists
    if (!data.items || data.items.length === 0) {
      throw new Error('Video not found');
    }
    
    const video = data.items[0];
    const snippet = video.snippet;
    
    // Get best quality thumbnail
    const thumbnail = snippet.thumbnails.maxres?.url || 
                     snippet.thumbnails.standard?.url || 
                     snippet.thumbnails.high?.url || 
                     snippet.thumbnails.medium?.url || 
                     snippet.thumbnails.default?.url;
    
    // Get localized description or fallback to regular description
    const description = snippet.localized?.description || snippet.description || '';
    
    // Truncate description to first 2-3 lines for display
    const shortDescription = description.split('\n').slice(0, 2).join('\n').substring(0, 150) + '...';
    
    return {
      title: snippet.localized?.title || snippet.title,
      author: snippet.channelTitle,
      thumbnail: thumbnail,
      description: shortDescription,
      fullDescription: description,
      tags: snippet.tags || [],
      publishedAt: snippet.publishedAt,
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
  videoDescription.textContent = `${data.description}`;
  
  initialState.classList.remove('active');
  videoInfoState.classList.add('active');
}

// Get highest quality stream URL
async function getHighestQualityStream(videoId) {
  try {
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
}

// Download video - OPTIMIZED FOR ONE-STEP DOWNLOAD
async function downloadVideo() {
  if (!currentVideoData || isDownloading) return;
  
  try {
    isDownloading = true;
    
    // Change button to grey and disable
    downloadBtnMain.classList.add('downloading');
    downloadBtnMain.disabled = true;
    downloadBtnTop.disabled = true;
    
    // Show progress - START FROM 0%
    progressContainer.classList.remove('hidden');
    updateProgress('0%', 'Initializing...');
    await new Promise(resolve => setTimeout(resolve, 100));
    updateProgress('15%', 'Connecting to API...');
    await new Promise(resolve => setTimeout(resolve, 200));
    updateProgress('30%', 'Analyzing video quality...');
    // Get stream URL - THIS IS THE HEAVY PART
    const streamUrl = await getHighestQualityStream(currentVideoData.videoId);
    updateProgress('80%', 'File ready! Preparing download...');
    await new Promise(resolve => setTimeout(resolve, 300));
    // Clean filename
    const filename = `${currentVideoData.title.replace(/[^a-z0-9]/gi, '_')}.mp4`;
    updateProgress('95%', 'Opening save dialog...');
    
    // Start download with saveAs - THIS SHOWS THE SAVE DIALOG IMMEDIATELY
    chrome.downloads.download({
      url: streamUrl,
      filename: filename,
      saveAs: true // This opens the save dialog instantly
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }
      
      // Complete - user has clicked save
      updateProgress('100%', 'Download started!');
      
      setTimeout(() => {
        // Reset everything back to initial state
        progressContainer.classList.add('hidden');
        progressFill.style.width = '0%';
        downloadBtnMain.classList.remove('downloading');
        downloadBtnMain.disabled = false;
        downloadBtnTop.disabled = false;
        isDownloading = false;
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
    
    // Reset on error
    progressContainer.classList.add('hidden');
    progressFill.style.width = '0%';
    downloadBtnMain.classList.remove('downloading');
    downloadBtnMain.disabled = false;
    downloadBtnTop.disabled = false;
    isDownloading = false;
  }
}

// Handle URL input - NOT NEEDED ANYMORE, AUTO-LOAD HANDLES IT
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
  
  await loadVideoInfo(videoId, url);
}

// Load video information
async function loadVideoInfo(videoId, url) {
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

// AUTO-DETECT AND AUTO-LOAD YouTube video on popup open
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  if (tabs[0] && tabs[0].url) {
    const videoId = getVideoId(tabs[0].url);
    if (videoId) {
      // Auto-fill URL
      urlInput.value = tabs[0].url;
      
      // AUTO-LOAD video info immediately
      await loadVideoInfo(videoId, tabs[0].url);
    }
  }
});