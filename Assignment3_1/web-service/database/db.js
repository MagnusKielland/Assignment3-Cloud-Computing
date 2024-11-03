// db.js
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');

// Create a Secrets Manager client
const secretsClient = new SecretsManagerClient({ region: 'ap-southeast-2' });

async function getDBCredentials() {
  const secretName = 'n12162841-DBSecrets';
  const command = new GetSecretValueCommand({ SecretId: secretName });

  try {
    const response = await secretsClient.send(command);
    const secrets = JSON.parse(response.SecretString);

    return {
      user: secrets.DB_USER,
      host: secrets.DB_HOST,
      database: secrets.DB_NAME,
      password: secrets.DB_PASSWORD,
      port: secrets.DB_PORT,
      ssl: { rejectUnauthorized: false }
    };
  } catch (err) {
    console.error('Error retrieving database credentials from Secrets Manager:', err);
    throw err;
  }
}

let pool;

async function initDBPool() {
  if (!pool) {
    const dbConfig = await getDBCredentials();
    pool = new Pool(dbConfig);
  }
  return pool;
}

module.exports = {
  query: async (text, params) => {
    const dbPool = await initDBPool();
    return dbPool.query(text, params);
  },
};
