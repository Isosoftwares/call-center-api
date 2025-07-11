const mongoose = require('mongoose');
require('dotenv').config();

const migrations = [
  {
    version: 1,
    description: 'Add indexes for performance',
    up: async () => {
      const db = mongoose.connection.db;
      
      // Call collection indexes
      await db.collection('calls').createIndex({ phoneNumber: 1, createdAt: -1 });
      await db.collection('calls').createIndex({ 'agentInfo.agentId': 1, createdAt: -1 });
      await db.collection('calls').createIndex({ status: 1 });
      await db.collection('calls').createIndex({ 'callDetails.startTime': 1 });
      
      // Agent collection indexes
      await db.collection('agents').createIndex({ status: 1, 'availability.isOnline': 1 });
      await db.collection('agents').createIndex({ agentId: 1 });
      
      console.log('✓ Added performance indexes');
    }
  },
  {
    version: 2,
    description: 'Add TTL indexes for temporary data',
    up: async () => {
      const db = mongoose.connection.db;
      
      // TTL index for old call logs (keep for 2 years)
      await db.collection('calls').createIndex(
        { createdAt: 1 }, 
        { expireAfterSeconds: 63072000 } // 2 years
      );
      
      console.log('✓ Added TTL indexes');
    }
  },
  {
    version: 3,
    description: 'Add composite indexes for analytics',
    up: async () => {
      const db = mongoose.connection.db;
      
      // Composite indexes for analytics queries
      await db.collection('calls').createIndex({
        'callDetails.startTime': 1,
        status: 1,
        direction: 1
      });
      
      await db.collection('calls').createIndex({
        'agentInfo.agentId': 1,
        'callDetails.startTime': 1,
        status: 1
      });
      
      console.log('✓ Added analytics indexes');
    }
  }
];

const runMigrations = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Get current migration version
    let migrationDoc = await db.collection('migrations').findOne({ _id: 'version' });
    let currentVersion = migrationDoc ? migrationDoc.version : 0;
    
    console.log(`Current migration version: ${currentVersion}`);

    // Run pending migrations
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      process.exit(0);
    }

    for (const migration of pendingMigrations) {
      console.log(`Running migration ${migration.version}: ${migration.description}`);
      await migration.up();
      
      // Update migration version
      await db.collection('migrations').replaceOne(
        { _id: 'version' },
        { _id: 'version', version: migration.version, updatedAt: new Date() },
        { upsert: true }
      );
      
      console.log(`✓ Migration ${migration.version} completed`);
    }

    console.log('All migrations completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };