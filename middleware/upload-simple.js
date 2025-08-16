const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

// Ensure upload directories exist
const uploadDirs = ['uploads/templates', 'uploads/csv', 'uploads/batches', 'temp'];
uploadDirs.forEach(dir => {
  fs.ensureDirSync(path.join(__dirname, '..', dir));
});

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine destination based on field name
    let dest = 'temp';
    if (file.fieldname === 'template' || file.fieldname === 'templates') {
      dest = 'uploads/templates';
    } else if (file.fieldname === 'csv') {
      dest = 'uploads/csv';
    } else if (file.fieldname === 'template1' || file.fieldname === 'template2') {
      dest = 'uploads/templates';
    }
    
    cb(null, path.join(__dirname, '..', dest));
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    
    cb(null, `${baseName}_${timestamp}_${randomString}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allow all files for now - validation will be handled by the validation middleware
  cb(null, true);
};

// Create multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 20 // Max 20 files
  }
});

module.exports = upload;
