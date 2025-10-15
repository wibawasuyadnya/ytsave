// src/background.js

/**
 * Background service worker for YTSave extension
 * Using RapidAPI YouTube Video FAST Downloader 24/7
 * Supports both regular videos and YouTube Shorts
 */

// RapidAPI Configuration
const RAPIDAPI_KEY = '7d03e636c8msha63c93d2737d5f9p17586cjsn5fba98ffadd7';
const RAPIDAPI_HOST = 'youtube-video-fast-downloader-24-7.p.rapidapi.com';

// Quality priority map (highest to lowest)
const QUALITY_CODES = {
  '571': '8K',
  '401': '4K',
  '400': '2K (1440p)',
  '399': '1080p60',
  '137': '1080p',
  '248': '1080p (VP9)',
  '136': '720p',
  '247': '720p (VP9)',
  '135': '480p',
  '134': '360p',
  '133': '240p',
  '160': '144p'
};

const QUALITY_PRIORITY = ['571', '401', '400', '399', '137', '248', '136', '247', '135', '134', '133', '160'];

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getVideoStream') {
    getHighestQualityVideoStream(request.videoId)
      .then(streamUrl => {
        sendResponse({ success: true, streamUrl: streamUrl });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
});

// Main function to get highest quality video stream
async function getHighestQualityVideoStream(videoId) {
  try {
    console.log(`🎬 Processing video: ${videoId}`);
    
    // Step 1: Get video info to see available formats and determine type
    const videoInfo = await getVideoInfo(videoId);
    
    console.log(`📊 Video title: ${videoInfo.title}`);
    console.log(`⏱️ Duration: ${videoInfo.duration}s`);
    console.log(`📹 Type: ${videoInfo.isShort ? 'Short' : 'Regular Video'}`);
    
    // Step 2: Extract available quality codes from formats
    const availableQualities = extractAvailableQualities(videoInfo.formats);
    console.log(`🎯 Available qualities:`, availableQualities);
    
    // Step 3: Select best quality
    const bestQuality = selectBestQuality(availableQualities);
    const qualityLabel = QUALITY_CODES[bestQuality] || bestQuality;
    console.log(`✨ Selected quality: ${bestQuality} (${qualityLabel})`);
    
    // Step 4: Get download URL
    const downloadData = await getDownloadUrl(videoId, bestQuality, videoInfo.isShort);
    
    // Step 5: Handle the response format
    const downloadUrl = downloadData.file || downloadData.reserved_file || downloadData.url;
    
    if (!downloadUrl) {
      throw new Error('No download URL in response');
    }
    
    console.log(`✅ Download URL obtained successfully`);
    console.log(`📦 File size: ${(downloadData.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`ℹ️ Note: ${downloadData.comment}`);
    
    return downloadUrl;

  } catch (error) {
    console.error('❌ Error getting video stream:', error);
    throw error;
  }
}

// Get video information using correct endpoint
async function getVideoInfo(videoId) {
  try {
    const url = `https://${RAPIDAPI_HOST}/get-video-info/${videoId}`;
    
    console.log(`🔍 Fetching video info from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Video not found. Please check the URL.');
      } else if (response.status === 401) {
        throw new Error('API key is invalid. Please check your subscription.');
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Determine if it's a Short (under 60 seconds)
    const duration = parseInt(data.duration) || 0;
    const isShort = duration <= 60 || data.url?.includes('/shorts/');
    
    return {
      title: data.title || 'Unknown',
      duration: duration,
      isShort: isShort,
      formats: data.formats || []
    };
    
  } catch (error) {
    console.error('Error fetching video info:', error);
    
    // If get-video-info fails, try to proceed with default quality
    console.warn('⚠️ Falling back to default quality 136 (720p)');
    return {
      title: 'Unknown',
      duration: 0,
      isShort: false,
      formats: [{ id: 136, quality: '720p' }]
    };
  }
}

// Extract available quality codes from formats array
function extractAvailableQualities(formats) {
  if (!formats || formats.length === 0) {
    console.warn('No formats available, using default');
    return ['136']; // Default to 720p
  }
  
  const qualities = [];
  
  for (const format of formats) {
    // Extract quality ID (format.id is the quality code)
    const qualityId = String(format.id);
    
    // Only include video formats (not audio-only)
    if (format.type === 'video' && qualityId) {
      qualities.push(qualityId);
    }
  }
  
  // If no video formats found, return default
  if (qualities.length === 0) {
    console.warn('No video formats found, using default');
    return ['136'];
  }
  
  return qualities;
}

// Select best quality from available options
function selectBestQuality(availableQualities) {
  if (!availableQualities || availableQualities.length === 0) {
    return '136'; // Default to 720p
  }
  
  // Find the highest quality available based on priority
  for (const quality of QUALITY_PRIORITY) {
    if (availableQualities.includes(quality)) {
      return quality;
    }
  }
  
  // If no match in priority list, return first available
  console.warn('Quality not in priority list, using first available');
  return availableQualities[0];
}

// Get download URL for specific quality
async function getDownloadUrl(videoId, quality, isShort = false) {
  try {
    // Choose correct endpoint based on video type
    const endpoint = isShort ? 'download_short' : 'download_video';
    const url = `https://${RAPIDAPI_HOST}/${endpoint}/${videoId}?quality=${quality}`;
    
    console.log(`📥 Requesting download: ${endpoint}/${videoId}?quality=${quality}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });

    if (!response.ok) {
      // Try opposite endpoint if this one fails
      if (!isShort) {
        console.warn('Regular endpoint failed, trying Short endpoint...');
        return await getDownloadUrl(videoId, quality, true);
      }
      
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    // API returns this structure:
    // {
    //   "id": 136,
    //   "type": "video",
    //   "quality": "720p",
    //   "bitrate": 1402766,
    //   "size": "2449827",
    //   "mime": "video/mp4; codecs=\"avc1.64001f\"",
    //   "comment": "The file will soon be ready...",
    //   "file": "https://...",
    //   "reserved_file": "https://..."
    // }
    
    return data;

  } catch (error) {
    console.error('Error getting download URL:', error);
    
    // Try with fallback quality (720p) if requested quality fails
    if (quality !== '136') {
      console.warn(`Quality ${quality} failed, trying 720p (136)...`);
      return await getDownloadUrl(videoId, '136', isShort);
    }
    
    throw error;
  }
}

// Monitor download progress with enhanced notifications
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state) {
    if (delta.state.current === 'complete') {
      console.log('✅ Download completed successfully');
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'YTSave - Success! 🎉',
        message: 'Video downloaded in highest quality',
        priority: 2
      });
      
    } else if (delta.state.current === 'interrupted') {
      console.error('❌ Download interrupted');
      
      // Get detailed error info
      chrome.downloads.search({ id: delta.id }, (downloads) => {
        if (downloads && downloads[0]) {
          const errorType = downloads[0].error || 'Unknown error';
          console.error('Download error type:', errorType);
          
          let errorMessage = 'Download failed. Please try again.';
          
          // Provide specific error messages
          if (errorType === 'SERVER_FORBIDDEN' || errorType === 'NETWORK_FAILED') {
            errorMessage = 'File not ready yet or access denied. Please wait a moment and try again.';
          } else if (errorType === 'FILE_ACCESS_DENIED') {
            errorMessage = 'Cannot save file. Check download folder permissions.';
          }
          
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'YTSave - Download Failed',
            message: errorMessage,
            priority: 2
          });
        }
      });
    }
  }
  
  // Show download progress
  if (delta.bytesReceived) {
    chrome.downloads.search({ id: delta.id }, (downloads) => {
      if (downloads && downloads[0] && downloads[0].totalBytes > 0) {
        const progress = Math.round((downloads[0].bytesReceived / downloads[0].totalBytes) * 100);
        if (progress % 25 === 0) { // Log every 25%
          console.log(`📊 Download progress: ${progress}%`);
        }
      }
    });
  }
});

// Log when download is created
chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log('📥 Download initiated:', downloadItem.filename);
});
