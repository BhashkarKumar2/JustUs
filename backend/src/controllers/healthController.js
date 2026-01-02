import mongoose from 'mongoose';

export const healthCheck = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    
    // Ping MongoDB
    const adminDb = db.admin();
    const pingResult = await adminDb.ping();
    
    // Count GridFS files
    const filesCollection = db.collection('fs.files');
    const fileCount = await filesCollection.countDocuments();
    
    res.json({
      mongo: 'ok',
      ping: pingResult,
      gridfsFiles: fileCount
    });
  } catch (error) {
    res.status(503).json({
      error: error.message
    });
  }
};
