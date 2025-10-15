// src/main.js

const BACKEND_URL = 'https://yt-save-temco-eb5d14f938e0.herokuapp.com';

// DOM Elements
const initialState = document.getElementById('initial-state');
const videoInfoState = document.getElementById('video-info-state');
const authState = document.getElementById('auth-state');
const settingsState = document.getElementById('settings-state');
const urlInput = document.getElementById('url-input');
const urlDisplay = document.getElementById('url-display');
const downloadBtnTop = document.getElementById('download-btn-top');
const downloadBtnMain = document.getElementById('download-btn-main');
const settingsBtn = document.getElementById('settings-btn');
const backBtn = document.getElementById('back-btn');
const thumbnail = document.getElementById('thumbnail');
const videoTitle = document.getElementById('video-title');
const videoDescription = document.getElementById('video-description');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const usageInfo = document.getElementById('usage-info');
const registerForm = document.getElementById('register-form');
const userEmail = document.getElementById('user-email');
const userTier = document.getElementById('user-tier');
const usageStats = document.getElementById('usage-stats');
const upgradeBtn = document.getElementById('upgrade-btn');

let currentVideoData = null;
let isDownloading = false;
let userInfo = null;

// Validate YouTube URL
function validateYouTubeUrl(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

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

// Update usage display
function updateUsageDisplay() {
  if (userInfo && userInfo.isLoggedIn) {
    const percentage = Math.round((userInfo.usage / userInfo.limit) * 100);
    usageInfo.textContent = `${userInfo.remaining}/${userInfo.limit} downloads remaining (${percentage}% used)`;
    usageInfo.classList.remove('hidden');
  } else {
    usageInfo.classList.add('hidden');
  }
}

// Fetch video metadata from backend (YouTube API)
async function fetchVideoMetadata(videoId) {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('Please register first');
    }
    
    const response = await fetch(`${BACKEND_URL}/api/youtube/video/${videoId}`, {
      headers: { 'x-api-key': apiKey }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch video metadata');
    }
    
    const data = await response.json();
    return data;
    
  } catch (error) {
    console.error('Error fetching metadata:', error);
    throw error;
  }
}

// Display video information
function displayVideoInfo(data) {
  thumbnail.src = data.thumbnail;
  videoTitle.textContent = data.title;
  videoDescription.textContent = data.description || `By ${data.author}`;
  
  initialState.classList.remove('active');
  videoInfoState.classList.add('active');
}

// Get highest quality stream URL
async function getHighestQualityStream(videoId) {
  try {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'getVideoStream', videoId: videoId },
        (response) => {
          if (response.success) {
            resolve(response);
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

// Download video
async function downloadVideo() {
  if (!currentVideoData || isDownloading) return;
  
  try {
    isDownloading = true;
    
    downloadBtnMain.classList.add('downloading');
    downloadBtnMain.disabled = true;
    downloadBtnTop.disabled = true;
    
    progressContainer.classList.remove('hidden');
    updateProgress('0%', 'Initializing...');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    updateProgress('15%', 'Connecting to API...');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    updateProgress('30%', 'Analyzing video quality...');
    
    const result = await getHighestQualityStream(currentVideoData.videoId);
    
    // Update user info
    userInfo.remaining = result.remainingRequests;
    userInfo.usage = userInfo.limit - result.remainingRequests;
    updateUsageDisplay();
    
    updateProgress('80%', 'File ready! Preparing download...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const filename = `${currentVideoData.title.replace(/[^a-z0-9]/gi, '_')}.mp4`;
    updateProgress('95%', 'Opening save dialog...');
    
    chrome.downloads.download({
      url: result.streamUrl,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }
      
      updateProgress('100%', 'Download started!');
      
      setTimeout(() => {
        progressContainer.classList.add('hidden');
        progressFill.style.width = '0%';
        downloadBtnMain.classList.remove('downloading');
        downloadBtnMain.disabled = false;
        downloadBtnTop.disabled = false;
        isDownloading = false;
        currentVideoData = null;
        
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
    showError(error.message || 'Failed to download video');
    
    progressContainer.classList.add('hidden');
    progressFill.style.width = '0%';
    downloadBtnMain.classList.remove('downloading');
    downloadBtnMain.disabled = false;
    downloadBtnTop.disabled = false;
    isDownloading = false;
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
    showError('Invalid YouTube URL');
    return;
  }
  
  await loadVideoInfo(videoId, url);
}

// Load video information
async function loadVideoInfo(videoId, url) {
  try {
    videoTitle.textContent = 'Loading...';
    videoDescription.textContent = 'Loading...';
    videoTitle.classList.add('loading');
    videoDescription.classList.add('loading');
    
    const metadata = await fetchVideoMetadata(videoId);
    currentVideoData = metadata;
    
    urlDisplay.value = url;
    displayVideoInfo(metadata);
    
    videoTitle.classList.remove('loading');
    videoDescription.classList.remove('loading');
    
  } catch (error) {
    console.error('Error:', error);
    showError('Failed to load video information');
    videoTitle.classList.remove('loading');
    videoDescription.classList.remove('loading');
  }
}

// Get API key from storage
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey'], (result) => {
      resolve(result.apiKey || null);
    });
  });
}

// Check if user is logged in
async function checkAuth() {
  chrome.runtime.sendMessage({ action: 'getUserInfo' }, (response) => {
    if (response.success && response.isLoggedIn) {
      userInfo = response;
      updateUsageDisplay();
      showMainInterface();
    } else {
      showAuthScreen();
    }
  });
}

// Show main interface
function showMainInterface() {
  authState.classList.remove('active');
  initialState.classList.add('active');
  settingsBtn.classList.remove('hidden');
}

// Show auth screen
function showAuthScreen() {
  authState.classList.add('active');
  initialState.classList.remove('active');
  videoInfoState.classList.remove('active');
  settingsState.classList.remove('active');
  settingsBtn.classList.add('hidden');
}

// Show settings
function showSettings() {
  if (!userInfo || !userInfo.isLoggedIn) return;
  
  initialState.classList.remove('active');
  videoInfoState.classList.remove('active');
  settingsState.classList.add('active');
  
  userEmail.textContent = userInfo.email;
  userTier.textContent = userInfo.tier.replace('_', ' ');
  usageStats.textContent = `${userInfo.usage} / ${userInfo.limit} downloads used this month`;
  
  if (userInfo.tier === 'FREE') {
    upgradeBtn.classList.remove('hidden');
  } else {
    upgradeBtn.classList.add('hidden');
  }
}

// Register user
async function registerUser(event) {
  event.preventDefault();
  
  const email = document.getElementById('email-input').value.trim();
  const name = document.getElementById('name-input').value.trim();
  
  if (!email) {
    showError('Please enter your email');
    return;
  }
  
  try {
    const registerBtn = document.getElementById('register-btn');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Registering...';
    
    chrome.runtime.sendMessage(
      { action: 'register', email, name },
      (response) => {
        if (response.success) {
          showError('Registration successful! Welcome to YTSave!');
          setTimeout(() => {
            checkAuth();
          }, 1000);
        } else {
          showError(response.error || 'Registration failed');
          registerBtn.disabled = false;
          registerBtn.textContent = 'Get Started Free';
        }
      }
    );
  } catch (error) {
    showError('Registration failed. Please try again.');
  }
}

// Upgrade to Pro
function upgradeToPro() {
  // Open Midtrans payment page
  const apiKey = getApiKey();
  window.open(`${BACKEND_URL}/payment.html?key=${apiKey}`, '_blank');
}

// Event listeners
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleUrlInput();
});

downloadBtnTop.addEventListener('click', handleUrlInput);
downloadBtnMain.addEventListener('click', downloadVideo);
settingsBtn.addEventListener('click', showSettings);
backBtn.addEventListener('click', () => {
  settingsState.classList.remove('active');
  initialState.classList.add('active');
});
registerForm.addEventListener('submit', registerUser);
upgradeBtn.addEventListener('click', upgradeToPro);

// Auto-detect YouTube video
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  if (tabs[0] && tabs[0].url) {
    const videoId = getVideoId(tabs[0].url);
    if (videoId) {
      urlInput.value = tabs[0].url;
      
      const apiKey = await getApiKey();
      if (apiKey) {
        await loadVideoInfo(videoId, tabs[0].url);
      }
    }
  }
});

// Initialize
checkAuth();