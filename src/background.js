/**
 * Background service worker for YTSave extension
 * */ 

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
      // Keep channel open for async response
    return true; 
  }
});

// Get highest quality video stream
async function getHighestQualityVideoStream(videoId) {
  try {
    // Fetch video page
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(videoUrl);
    const html = await response.text();
    
    // Extract player response from page
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    
    if (!playerResponseMatch) {
      throw new Error('Could not extract video information');
    }
    
    const playerResponse = JSON.parse(playerResponseMatch[1]);
    
    // Check if video is available
    if (playerResponse.playabilityStatus?.status !== 'OK') {
      throw new Error(playerResponse.playabilityStatus?.reason || 'Video is not available');
    }
    
    // Get streaming data
    const streamingData = playerResponse.streamingData;
    
    if (!streamingData) {
      throw new Error('No streaming data available');
    }
    
    // Get formats (includes video+audio combined formats)
    const formats = streamingData.formats || [];
    const adaptiveFormats = streamingData.adaptiveFormats || [];
    
    // Prefer formats with both video and audio
    let bestFormat = null;
    let highestQuality = 0;
    
    // Check combined formats first (video + audio)
    for (const format of formats) {
      if (format.mimeType?.includes('video/mp4')) {
        const quality = parseInt(format.height) || 0;
        if (quality > highestQuality) {
          highestQuality = quality;
          bestFormat = format;
        }
      }
    }
    
    // If no combined format, get highest video quality from adaptive formats
    if (!bestFormat) {
      for (const format of adaptiveFormats) {
        if (format.mimeType?.includes('video/mp4') && !format.mimeType?.includes('audio')) {
          const quality = parseInt(format.height) || 0;
          if (quality > highestQuality) {
            highestQuality = quality;
            bestFormat = format;
          }
        }
      }
    }
    
    if (!bestFormat || !bestFormat.url) {
      throw new Error('No suitable video format found');
    }
    
    return bestFormat.url;
    
  } catch (error) {
    console.error('Error getting video stream:', error);
    throw error;
  }
}

// Monitor download progress
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state) {
    if (delta.state.current === 'complete') {
      console.log('Download completed');
    } else if (delta.state.current === 'interrupted') {
      console.error('Download interrupted');
    }
  }
});