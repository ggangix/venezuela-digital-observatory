#!/usr/bin/env node
/**
 * Sync whois_gobve.json into MongoDB (ve_monitor_whois)
 * Usage: node import-whois-to-mongo.js [path-to-whois.json]
 *
 * Upserts every domain in the file and removes domains no longer present,
 * so the collection is never left empty mid-import.
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ve_monitor';
const DEFAULT_FILE = process.env.DATA_FILE || path.join(__dirname, '../data/whois_gobve.json');

async function importWhoisToMongo(jsonPath) {
  const filePath = jsonPath || DEFAULT_FILE;

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!Array.isArray(data.domains) || !data._meta || data.domains.length === 0) {
    console.error('Invalid whois.json format');
    process.exit(1);
  }

  const { _meta, domains } = data;
  console.log(`Found ${domains.length} WHOIS records, generated at ${_meta.generated}`);

  let client;
  try {
    console.log(`Connecting to MongoDB: ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    client = new MongoClient(MONGO_URI);
    await client.connect();

    const db = client.db();
    const whoisCollection = db.collection('ve_monitor_whois');

    const existingCount = await whoisCollection.countDocuments();
    console.log(`Existing WHOIS records in DB: ${existingCount}`);

    // Create indexes
    await whoisCollection.createIndex({ domain: 1 }, { unique: true });
    await whoisCollection.createIndex({ org: 1 });
    await whoisCollection.createIndex({ registeredDate: -1 });
    await whoisCollection.createIndex({ expireDate: 1 });

    const importedAt = new Date();
    const sourceGenerated = new Date(_meta.generated);

    const ops = domains.map(d => ({
      updateOne: {
        filter: { domain: d.domain },
        update: {
          $set: {
            domain: d.domain,
            registrar: d.registrar || null,
            registeredDate: d.registered_date ? new Date(d.registered_date) : null,
            expireDate: d.expire ? new Date(d.expire) : null,
            changedDate: d.changed ? new Date(d.changed) : null,
            org: d.org || null,
            city: d.city || null,
            country: d.country || null,
            nameservers: d.nameservers || [],
            importedAt,
            sourceGenerated
          }
        },
        upsert: true
      }
    }));

    const result = await whoisCollection.bulkWrite(ops, { ordered: false });
    console.log(`Upserted ${result.upsertedCount} new, updated ${result.modifiedCount} WHOIS records`);

    // Remove domains no longer in the source file
    const removed = await whoisCollection.deleteMany({
      domain: { $nin: domains.map(d => d.domain) }
    });
    if (removed.deletedCount > 0) {
      console.log(`Removed ${removed.deletedCount} WHOIS records not in source`);
    }

    const totalRecords = await whoisCollection.countDocuments();
    console.log(`Total WHOIS records in DB: ${totalRecords}`);

  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run
const jsonPath = process.argv[2];
importWhoisToMongo(jsonPath)
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
