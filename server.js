const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve all static files from root

// Your configuration
const FOLDER_ID = '12vn5kpXXSHt7REDv7SA9js-hrRFggVHm';
const GOOGLE_API_KEY = 'AIzaSyDzrx0_Hv6IEHDXcy3xL7UWCXuTHK_R2ro';

// Admin configuration
const ADMIN_CONFIG = {
  passcode: "0852",
  announcementRetentionDays: 30 // Auto-delete announcements older than 30 days
};

let announcements = [
  {
    id: 1,
    title: "Welcome to STEM 11 Confucius!",
    date: "2025-01-15",
    content: "Welcome to our class! We're excited to start this academic year together. Let's make it memorable and productive.",
    type: "important",
    tags: ["Welcome", "Introduction"]
  }
];

// Auto-clean old announcements function
function cleanOldAnnouncements() {
  const now = new Date();
  const cutoffDate = new Date(now.setDate(now.getDate() - ADMIN_CONFIG.announcementRetentionDays));
  
  announcements = announcements.filter(announcement => {
    const announcementDate = new Date(announcement.date);
    return announcementDate >= cutoffDate;
  });
  
  console.log(`Auto-cleaned announcements. ${announcements.length} announcements remaining.`);
}

// Run auto-clean on startup and then daily
cleanOldAnnouncements();
setInterval(cleanOldAnnouncements, 24 * 60 * 60 * 1000); // Run daily

// Update the WebSocket connection to handle passcode verification
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  
  // Send current announcements to new client
  ws.send(JSON.stringify({
    type: 'announcements',
    data: announcements
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'new_announcement':
          // Verify passcode first
          if (data.passcode !== ADMIN_CONFIG.passcode) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid passcode'
            }));
            return;
          }
          
          // Add new announcement and broadcast to all clients
          const newAnnouncement = {
            id: announcements.length > 0 ? Math.max(...announcements.map(a => a.id)) + 1 : 1,
            ...data.announcement,
            date: new Date().toISOString().split('T')[0]
          };
          
          announcements.unshift(newAnnouncement);
          
          // Broadcast to all connected clients
          broadcast({
            type: 'announcements',
            data: announcements
          });
          
          // Send success confirmation
          ws.send(JSON.stringify({
            type: 'announcement_added',
            announcement: newAnnouncement
          }));
          break;
          
        case 'verify_passcode':
          // Verify passcode
          const isValid = data.passcode === ADMIN_CONFIG.passcode;
          ws.send(JSON.stringify({
            type: 'passcode_result',
            valid: isValid
          }));
          break;
          
        case 'request_announcements':
          // Send current announcements
          ws.send(JSON.stringify({
            type: 'announcements',
            data: announcements
          }));
          break;
          
        case 'request_gallery':
          // Client requests gallery data
          fetchGalleryData().then(galleryData => {
            ws.send(JSON.stringify({
              type: 'gallery_data',
              data: galleryData
            }));
          }).catch(error => {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to fetch gallery data'
            }));
          });
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

// Add API endpoint to get admin config (optional, for admin panel)
app.get('/api/admin/config', (req, res) => {
  // Return only non-sensitive config
  res.json({
    retentionDays: ADMIN_CONFIG.announcementRetentionDays
  });
});

// Add API endpoint to update passcode (protected)
app.post('/api/admin/update-passcode', (req, res) => {
  const { currentPasscode, newPasscode } = req.body;
  
  if (currentPasscode !== ADMIN_CONFIG.passcode) {
    return res.status(401).json({
      success: false,
      error: 'Invalid current passcode'
    });
  }
  
  ADMIN_CONFIG.passcode = newPasscode;
  
  res.json({
    success: true,
    message: 'Passcode updated successfully'
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  
  // Send current announcements to new client
  ws.send(JSON.stringify({
    type: 'announcements',
    data: announcements
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'new_announcement':
          // Add new announcement and broadcast to all clients
          const newAnnouncement = {
            id: announcements.length > 0 ? Math.max(...announcements.map(a => a.id)) + 1 : 1,
            ...data.data,
            date: new Date().toISOString().split('T')[0]
          };
          
          announcements.unshift(newAnnouncement);
          
          // Broadcast to all connected clients
          broadcast({
            type: 'announcements',
            data: announcements
          });
          break;
          
        case 'request_gallery':
          // Client requests gallery data
          fetchGalleryData().then(galleryData => {
            ws.send(JSON.stringify({
              type: 'gallery_data',
              data: galleryData
            }));
          }).catch(error => {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to fetch gallery data'
            }));
          });
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

// Enhanced function to get direct download URLs
function getDirectDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// Enhanced function to get view URLs
function getViewUrl(fileId) {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

// Enhanced function to get thumbnail URLs
function getThumbnailUrl(fileId, size = 'w300') {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}&export=view`;
}

// Update the fetchFolderContents function to use enhanced URLs
async function fetchFolderContents(folderId, apiKey) {
  try {
    const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
      params: {
        q: `'${folderId}' in parents and trashed=false`,
        key: apiKey,
        fields: 'files(id, name, mimeType, webViewLink, webContentLink, size, createdTime, modifiedTime, thumbnailLink, imageMediaMetadata)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 1000
      }
    });

    const items = response.data.files;
    const images = [];
    const folders = [];

    items.forEach(item => {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        folders.push({
          id: item.id,
          name: item.name,
          type: 'folder',
          mimeType: item.mimeType,
          createdTime: item.createdTime,
          modifiedTime: item.modifiedTime
        });
      } else if (item.mimeType.startsWith('image/')) {
        // Use enhanced URL functions
        const directUrl = getDirectDownloadUrl(item.id);
        const viewUrl = `https://drive.google.com/thumbnail?id=${item.id}&sz=w1000`;
        const thumbnailUrl = `https://drive.google.com/thumbnail?id=${item.id}&sz=w300`;
        
        images.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          directUrl: directUrl,
          viewUrl: viewUrl,
          thumbnailUrl: thumbnailUrl,
          webViewLink: item.webViewLink,
          size: item.size,
          createdTime: item.createdTime,
          modifiedTime: item.modifiedTime,
          // Add additional metadata
          width: item.imageMediaMetadata?.width || 0,
          height: item.imageMediaMetadata?.height || 0
        });
      }
    });

    return { images, folders };
  } catch (error) {
    console.error('Error fetching folder contents:', error.response?.data || error.message);
    throw error;
  }
}

// Add CORS proxy endpoint for image downloading (to avoid CORS issues)
app.get('/api/proxy/image/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const imageUrl = getDirectDownloadUrl(fileId);
    
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream',
      headers: {
        'Referer': 'https://drive.google.com/'
      }
    });
    
    // Set appropriate headers
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Content-Length', response.headers['content-length']);
    res.setHeader('Content-Disposition', `attachment; filename="image-${fileId}.jpg"`);
    
    response.data.pipe(res);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

// Add bulk download endpoint
app.get('/api/download/zip', async (req, res) => {
  try {
    const { imageIds } = req.query;
    const ids = imageIds ? imageIds.split(',') : [];
    
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No image IDs provided' });
    }
    
    // Create zip file
    const archiver = require('archiver');
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="cfs-gallery-${Date.now()}.zip"`);
    
    archive.pipe(res);
    
    // Add each image to the zip
    for (const fileId of ids) {
      try {
        const imageUrl = getDirectDownloadUrl(fileId);
        const response = await axios({
          method: 'GET',
          url: imageUrl,
          responseType: 'stream',
          headers: {
            'Referer': 'https://drive.google.com/'
          }
        });
        
        archive.append(response.data, { name: `image-${fileId}.jpg` });
      } catch (error) {
        console.error(`Failed to add image ${fileId} to zip:`, error);
      }
    }
    
    await archive.finalize();
    
  } catch (error) {
    console.error('Zip creation error:', error);
    res.status(500).json({ error: 'Failed to create zip file' });
  }
});

// Broadcast to all connected clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Helper function to fetch folder contents
async function fetchFolderContents(folderId, apiKey) {
  try {
    const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
      params: {
        q: `'${folderId}' in parents and trashed=false`,
        key: apiKey,
        fields: 'files(id, name, mimeType, webViewLink, webContentLink, size, createdTime, modifiedTime, thumbnailLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 1000
      }
    });

    const items = response.data.files;
    const images = [];
    const folders = [];

    items.forEach(item => {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        folders.push({
          id: item.id,
          name: item.name,
          type: 'folder',
          mimeType: item.mimeType,
          createdTime: item.createdTime,
          modifiedTime: item.modifiedTime
        });
      } else if (item.mimeType.startsWith('image/')) {
        // Use enhanced URL functions
        const directUrl = getDirectDownloadUrl(item.id);
        const viewUrl = getViewUrl(item.id);
        const thumbnailUrl = getThumbnailUrl(item.id);
        
        images.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          directUrl: directUrl,
          viewUrl: viewUrl,
          thumbnailUrl: thumbnailUrl,
          webViewLink: item.webViewLink,
          size: item.size,
          createdTime: item.createdTime,
          modifiedTime: item.modifiedTime
        });
      }
    });

    return { images, folders };
  } catch (error) {
    console.error('Error fetching folder contents:', error.response?.data || error.message);
    throw error;
  }
}

// Recursive function to get ALL subfolders and their contents
async function fetchFolderStructureRecursive(folderId, path = '') {
  try {
    const contents = await fetchFolderContents(folderId, GOOGLE_API_KEY);
    
    // Process all subfolders recursively
    const subfoldersWithContents = await Promise.all(
      contents.folders.map(async (folder) => {
        const folderPath = path ? `${path}/${folder.name}` : folder.name;
        const subContents = await fetchFolderStructureRecursive(folder.id, folderPath);
        
        return {
          ...folder,
          path: folderPath,
          images: subContents.images,
          subfolders: subContents.subfolders,
          imageCount: subContents.images.length,
          subfolderCount: subContents.subfolders.length,
          thumbnail: subContents.images.length > 0 ? subContents.images[0].thumbnailUrl : null
        };
      })
    );

    return {
      images: contents.images,
      subfolders: subfoldersWithContents
    };
  } catch (error) {
    console.error(`Error in fetchFolderStructureRecursive for folder ${folderId}:`, error.message);
    return { images: [], subfolders: [] };
  }
}

// Get complete folder tree with all contents
async function getCompleteGalleryStructure() {
  try {
    console.log('Fetching complete gallery structure recursively from folder:', FOLDER_ID);
    
    const rootContents = await fetchFolderStructureRecursive(FOLDER_ID, '');
    
    // Count total images recursively
    function countTotalImages(structure) {
      let count = structure.images.length;
      structure.subfolders.forEach(subfolder => {
        count += countTotalImages(subfolder);
      });
      return count;
    }

    // Count total folders recursively
    function countTotalFolders(structure) {
      let count = structure.subfolders.length;
      structure.subfolders.forEach(subfolder => {
        count += countTotalFolders(subfolder);
      });
      return count;
    }

    const totalImages = countTotalImages(rootContents);
    const totalFolders = countTotalFolders(rootContents);

    return {
      rootFolder: {
        id: FOLDER_ID,
        name: 'CFS Hub Gallery',
        path: ''
      },
      structure: rootContents,
      stats: {
        totalImages: totalImages,
        totalFolders: totalFolders,
        rootImages: rootContents.images.length,
        rootSubfolders: rootContents.subfolders.length
      }
    };
  } catch (error) {
    console.error('Error getting complete gallery structure:', error);
    throw error;
  }
}

// Get flat list of all images from all subfolders
async function getAllImagesFlat() {
  try {
    const structure = await getCompleteGalleryStructure();
    
    function flattenImages(structure, path = '') {
      let images = [...structure.images.map(img => ({ ...img, folderPath: path }))];
      
      structure.subfolders.forEach(subfolder => {
        const subPath = path ? `${path}/${subfolder.name}` : subfolder.name;
        images = [...images, ...flattenImages(subfolder, subPath)];
      });
      
      return images;
    }

    return flattenImages(structure.structure);
  } catch (error) {
    console.error('Error getting all images flat:', error);
    throw error;
  }
}

// Cached gallery data
let cachedGalleryData = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch gallery data with caching
async function fetchGalleryData() {
  const now = Date.now();
  
  if (cachedGalleryData && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('Returning cached gallery data');
    return cachedGalleryData;
  }
  
  console.log('Fetching fresh gallery data');
  const completeStructure = await getCompleteGalleryStructure();
  
  // For backward compatibility, also provide the collections view
  function getCollectionsView(structure) {
    const collections = structure.subfolders.map(subfolder => ({
      id: subfolder.id,
      name: subfolder.name,
      path: subfolder.path,
      type: 'folder',
      mimeType: 'application/vnd.google-apps.folder',
      imageCount: subfolder.imageCount,
      subfolderCount: subfolder.subfolderCount,
      thumbnail: subfolder.thumbnail,
      images: subfolder.images.slice(0, 4), // Preview images
      subfolders: subfolder.subfolders.slice(0, 5) // Preview subfolders
    }));

    return collections;
  }

  const collections = getCollectionsView(completeStructure.structure);

  cachedGalleryData = {
    success: true,
    rootFolder: {
      id: FOLDER_ID,
      name: 'CFS Hub Gallery',
      imageCount: completeStructure.structure.images.length,
      collectionCount: collections.length
    },
    collections: collections,
    directImages: completeStructure.structure.images,
    stats: completeStructure.stats
  };
  
  cacheTimestamp = now;
  
  return cachedGalleryData;
}

// API Routes

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/people', (req, res) => {
  res.sendFile(path.join(__dirname, 'people.html'));
});

app.get('/updates', (req, res) => {
  res.sendFile(path.join(__dirname, 'updates.html'));
});

app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'gallery.html'));
});

app.get('/help', (req, res) => {
  res.sendFile(path.join(__dirname, 'help.html'));
});

// API endpoints
app.get('/api/gallery/complete', async (req, res) => {
  try {
    const completeStructure = await getCompleteGalleryStructure();
    
    res.json({
      success: true,
      ...completeStructure
    });

  } catch (error) {
    console.error('Error fetching complete gallery:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch complete gallery data',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Main gallery endpoint (with caching)
app.get('/api/gallery', async (req, res) => {
  try {
    const galleryData = await fetchGalleryData();
    res.json(galleryData);
  } catch (error) {
    console.error('Error fetching gallery:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gallery data',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// API endpoint to get flat list of all images
app.get('/api/images', async (req, res) => {
  try {
    console.log('Fetching all images recursively from folder:', FOLDER_ID);
    
    const allImages = await getAllImagesFlat();
    
    res.json({
      success: true,
      count: allImages.length,
      images: allImages
    });

  } catch (error) {
    console.error('Error fetching images:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch images',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Folder endpoint for specific folder access
app.get('/api/folder/:folderId', async (req, res) => {
  try {
    const folderId = req.params.folderId || FOLDER_ID;
    const includeSubfolders = req.query.subfolders === 'true';
    
    console.log('Fetching folder contents:', folderId);
    
    let allImages = [];
    let allFolders = [];

    async function getFolderRecursive(folderId, path = '') {
      const contents = await fetchFolderContents(folderId, GOOGLE_API_KEY);
      
      const imagesWithPath = contents.images.map(img => ({
        ...img,
        folderPath: path
      }));
      
      allImages = [...allImages, ...imagesWithPath];
      allFolders = [...allFolders, ...contents.folders.map(f => ({ ...f, path }))];

      if (includeSubfolders) {
        for (const folder of contents.folders) {
          await getFolderRecursive(folder.id, path ? `${path}/${folder.name}` : folder.name);
        }
      }
    }

    await getFolderRecursive(folderId);

    res.json({
      success: true,
      folderId: folderId,
      includeSubfolders: includeSubfolders,
      images: allImages,
      folders: allFolders,
      count: allImages.length,
      folderCount: allFolders.length
    });

  } catch (error) {
    console.error('Error fetching folder:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch folder contents',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Announcements API
app.get('/api/announcements', (req, res) => {
  res.json({
    success: true,
    announcements: announcements
  });
});

app.post('/api/announcements', (req, res) => {
  const { title, content, type, tags } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({
      success: false,
      error: 'Title and content are required'
    });
  }
  
  const newAnnouncement = {
    id: announcements.length > 0 ? Math.max(...announcements.map(a => a.id)) + 1 : 1,
    title,
    content,
    type: type || 'important',
    tags: tags || [],
    date: new Date().toISOString().split('T')[0]
  };
  
  announcements.unshift(newAnnouncement);
  
  // Broadcast to WebSocket clients
  broadcast({
    type: 'announcements',
    data: announcements
  });
  
  res.json({
    success: true,
    announcement: newAnnouncement
  });
});

// Facebook profile picture proxy
app.get('/api/facebook/profile-pic/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const fbProfileUrl = `https://graph.facebook.com/${username}/picture?width=150&height=150&access_token=350685531728|62f8ce9f74b12f84c123cc23437a4a32&width=1000&height=1000`;
        
        const response = await axios({
            method: 'GET',
            url: fbProfileUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 day
        
        response.data.pipe(res);
    } catch (error) {
        console.error('Facebook profile pic proxy error:', error);
        // Fallback to placeholder
        res.redirect(path.join(__dirname, 'placeholder.png'));
    }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
  console.log(`Gallery API: http://localhost:${PORT}/api/gallery`);
  console.log(`Announcements API: http://localhost:${PORT}/api/announcements`);
});