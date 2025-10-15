// src/background.js
// Background service worker - Communicates with backend only

const BACKEND_URL = 'https://yt-save-temco-eb5d14f938e0.herokuapp.com'; 

const QUALITY_PRIORITY = ['571', '401', '400', '399', '137', '248', '136', '247', '135', '134', '133', '160'];

// Get user API key from storage
async function getUserApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey'], (result) => {
      resolve(result.apiKey || null);
    });
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getVideoStream') {
    getHighestQualityVideoStream(request.videoId)
      .then(response => {
        sendResponse({ success: true, ...response });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'getUserInfo') {
    getUserInfo()
      .then(info => {
        sendResponse({ success: true, ...info });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'register') {
    registerUser(request.email, request.name)
      .then(result => {
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Register new user
async function registerUser(email, name) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, name })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    // Save API key to storage
    await chrome.storage.sync.set({ apiKey: data.apiKey });
    
    return data;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

// Get highest quality video stream
async function getHighestQualityVideoStream(videoId) {
  try {
    console.log(`🎬 Processing video: ${videoId}`);
    
    const apiKey = await getUserApiKey();
    
    if (!apiKey) {
      throw new Error('Please login or register first');
    }
    
    // Step 1: Get video info
    const videoInfo = await getVideoInfo(videoId, apiKey);
    
    console.log(`📊 Video title: ${videoInfo.title}`);
    console.log(`⏱️ Duration: ${videoInfo.duration}s`);
    console.log(`📹 Type: ${videoInfo.isShort ? 'Short' : 'Regular Video'}`);
    console.log(`📦 Remaining: ${videoInfo.remainingRequests}`);
    
    // Step 2: Extract qualities
    const availableQualities = extractAvailableQualities(videoInfo.formats);
    console.log(`🎯 Available qualities:`, availableQualities);
    
    // Step 3: Select best quality
    const bestQuality = selectBestQuality(availableQualities);
    console.log(`✨ Selected quality: ${bestQuality}`);
    
    // Step 4: Get download URL
    const downloadData = await getDownloadUrl(videoId, bestQuality, videoInfo.isShort, apiKey);
    
    const downloadUrl = downloadData.file || downloadData.reserved_file || downloadData.url;
    
    if (!downloadUrl) {
      throw new Error('No download URL in response');
    }
    
    console.log(`✅ Download URL obtained`);
    console.log(`📦 Remaining: ${downloadData.remainingRequests}`);
    
    return {
      streamUrl: downloadUrl,
      remainingRequests: downloadData.remainingRequests,
      userTier: downloadData.userTier
    };

  } catch (error) {
    console.error('❌ Error:', error);
    
    // Check if it's a limit error
    if (error.message.includes('limit') || error.message.includes('Upgrade')) {
      throw new Error(error.message + '\n\nClick Settings to upgrade to Pro!');
    }
    
    throw error;
  }
}

// Get video information via backend
async function getVideoInfo(videoId, apiKey) {
  try {
    const url = `${BACKEND_URL}/api/video/info/${videoId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    
    const duration = parseInt(data.duration) || 0;
    const isShort = duration <= 60 || data.url?.includes('/shorts/');
    
    return {
      title: data.title || 'Unknown',
      duration: duration,
      isShort: isShort,
      formats: data.formats || [],
      remainingRequests: data.remainingRequests,
      userTier: data.userTier
    };
    
  } catch (error) {
    console.error('Error fetching video info:', error);
    throw error;
  }
}

// Extract available qualities
function extractAvailableQualities(formats) {
  if (!formats || formats.length === 0) {
    return ['136'];
  }
  
  const qualities = [];
  for (const format of formats) {
    const qualityId = String(format.id);
    if (format.type === 'video' && qualityId) {
      qualities.push(qualityId);
    }
  }
  
  return qualities.length > 0 ? qualities : ['136'];
}

// Select best quality
function selectBestQuality(availableQualities) {
  if (!availableQualities || availableQualities.length === 0) {
    return '136';
  }
  
  for (const quality of QUALITY_PRIORITY) {
    if (availableQualities.includes(quality)) {
      return quality;
    }
  }
  
  return availableQualities[0];
}

// Get download URL via backend
async function getDownloadUrl(videoId, quality, isShort = false, apiKey) {
  try {
    const url = `${BACKEND_URL}/api/video/download/${videoId}?quality=${quality}&isShort=${isShort}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;

  } catch (error) {
    console.error('Error getting download URL:', error);
    throw error;
  }
}

// Get user info
async function getUserInfo() {
  try {
    const apiKey = await getUserApiKey();
    
    if (!apiKey) {
      return {
        isLoggedIn: false,
        tier: 'FREE',
        usage: 0,
        limit: 100,
        remaining: 100
      };
    }
    
    const response = await fetch(`${BACKEND_URL}/api/user/info`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey
      }
    });
    
    if (!response.ok) {
      return {
        isLoggedIn: false,
        tier: 'FREE',
        usage: 0,
        limit: 100,
        remaining: 100
      };
    }
    
    const data = await response.json();
    
    return {
      isLoggedIn: true,
      ...data
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      isLoggedIn: false,
      tier: 'FREE',
      usage: 0,
      limit: 100,
      remaining: 100
    };
  }
}

// Monitor downloads
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state) {
    if (delta.state.current === 'complete') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/YS_48.png',
        title: 'YTSave - Success! 🎉',
        message: 'Video downloaded successfully',
        priority: 2
      });
    } else if (delta.state.current === 'interrupted') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/YS_48.png',
        title: 'YTSave - Download Failed',
        message: 'Please try again',
        priority: 2
      });
    }
  }
});

chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log('📥 Download initiated:', downloadItem.filename);
});