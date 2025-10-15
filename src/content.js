// src/content.js
// Content script for YTSave extension
// Runs on YouTube pages to enhance functionality

(function() {
  'use strict';
  
  // Add download button to YouTube page (optional feature)
  function addDownloadButton() {
    // Check if we're on a video page
    const videoId = getVideoIdFromPage();
    if (!videoId) return;
    
    // Check if button already exists
    if (document.getElementById('ytsave-download-btn')) return;
    
    // Find the action buttons container
    const actionsContainer = document.querySelector('#top-level-buttons-computed');
    if (!actionsContainer) return;
    
    // Create download button
    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'ytsave-download-btn';
    downloadBtn.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m';
    downloadBtn.innerHTML = `
      <div class="yt-spec-button-shape-next__button-text-content">
        <span class="yt-core-attributed-string">⬇️ Download</span>
      </div>
    `;
    
    downloadBtn.style.marginLeft = '8px';
    
    // Add click handler
    downloadBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openPopup', videoId: videoId });
    });
    
    // Insert button
    actionsContainer.appendChild(downloadBtn);
  }
  
  // Get video ID from current page
  function getVideoIdFromPage() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }
  
  // Listen for page navigation (YouTube uses SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(addDownloadButton, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
  
  // Initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(addDownloadButton, 2000);
    });
  } else {
    setTimeout(addDownloadButton, 2000);
  }
  
})();