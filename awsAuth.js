/**
 * AWS Authentication & Cloud Persistence Service
 * 
 * Direct zero-dependency SigV4 implementation for:
 *   - Amazon Cognito User Pool (AdminCreateUser, AdminSetUserPassword, AdminGetUser)
 *   - Amazon DynamoDB (Users, Items, Claims tables)
 */

const crypto = require('crypto');
const https = require('https');

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const USER_POOL_ID = process.env.AWS_COGNITO_USER_POOL_ID || 'ap-southeast-2_6T5HXx7Xx';
const TABLE_PREFIX = process.env.AWS_DYNAMODB_TABLE_PREFIX || 'CampusConnect';

const USERS_TABLE = `${TABLE_PREFIX}_Users`;
const ITEMS_TABLE = `${TABLE_PREFIX}_Items`;
const CLAIMS_TABLE = `${TABLE_PREFIX}_Claims`;

function isAwsConfigured() {
  return Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

function hmac(key, string, encoding) {
  return crypto.createHmac('sha256', key).update(string, 'utf8').digest(encoding);
}

function hash(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
}

/**
 * Execute an AWS API request signed with SigV4
 */
function callAwsApi({ service, target, host, payload }) {
  return new Promise((resolve, reject) => {
    const payloadStr = JSON.stringify(payload);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = hash(payloadStr);

    const canonicalHeaders =
      `content-type:application/x-amz-json-1.0\n` +
      `host:${host}\n` +
      `x-amz-date:${amzDate}\n` +
      `x-amz-target:${target}\n`;

    const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';

    const canonicalRequest =
      `POST\n` +
      `/\n` +
      `\n` +
      `${canonicalHeaders}\n` +
      `${signedHeaders}\n` +
      `${payloadHash}`;

    const credentialScope = `${dateStamp}/${REGION}/${service}/aws4_request`;
    const stringToSign =
      `AWS4-HMAC-SHA256\n` +
      `${amzDate}\n` +
      `${credentialScope}\n` +
      `${hash(canonicalRequest)}`;

    const kDate = hmac(`AWS4${SECRET_ACCESS_KEY}`, dateStamp);
    const kRegion = hmac(kDate, REGION);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmac(kSigning, stringToSign, 'hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const options = {
      hostname: host,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Host': host,
        'Content-Type': 'application/x-amz-json-1.0',
        'x-amz-date': amzDate,
        'x-amz-target': target,
        'Authorization': authHeader
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body || '{}'));
          } catch (e) {
            resolve(body);
          }
        } else {
          try {
            const errObj = JSON.parse(body);
            const err = new Error(errObj.message || errObj.__type || body);
            err.__type = errObj.__type;
            err.statusCode = res.statusCode;
            reject(err);
          } catch (e) {
            reject(new Error(`AWS ${service} Error (${res.statusCode}): ${body}`));
          }
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payloadStr);
    req.end();
  });
}

// ──────────────────────────────────────────────
// Amazon Cognito User Pool Operations
// ──────────────────────────────────────────────

/**
 * Register a user into Amazon Cognito User Pool with CONFIRMED status.
 */
async function registerUserInCognito({ email, password, name, collegeId }) {
  if (!isAwsConfigured() || !USER_POOL_ID) return null;

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. Create User in Cognito User Pool
    const createRes = await callAwsApi({
      service: 'cognito-idp',
      target: 'AWSCognitoIdentityProviderService.AdminCreateUser',
      host: `cognito-idp.${REGION}.amazonaws.com`,
      payload: {
        UserPoolId: USER_POOL_ID,
        Username: normalizedEmail,
        UserAttributes: [
          { Name: 'email', Value: normalizedEmail },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name.trim() }
        ],
        MessageAction: 'SUPPRESS'
      }
    });

    // 2. Set permanent password so user status is CONFIRMED immediately
    await callAwsApi({
      service: 'cognito-idp',
      target: 'AWSCognitoIdentityProviderService.AdminSetUserPassword',
      host: `cognito-idp.${REGION}.amazonaws.com`,
      payload: {
        UserPoolId: USER_POOL_ID,
        Username: normalizedEmail,
        Password: password,
        Permanent: true
      }
    });

    console.log(`[Cognito] Successfully created and CONFIRMED user ${normalizedEmail} in User Pool`);
    return createRes.User;
  } catch (err) {
    if (err.__type && err.__type.includes('UsernameExistsException')) {
      console.log(`[Cognito] User ${normalizedEmail} already exists in Cognito`);
      const dupError = new Error('An account with this email already exists.');
      dupError.statusCode = 400;
      throw dupError;
    }
    console.error(`[Cognito Error] Failed to register user:`, err.message);
    throw err;
  }
}

/**
 * Update user password in Amazon Cognito
 */
async function setCognitoPassword(email, newPassword) {
  if (!isAwsConfigured() || !USER_POOL_ID) return false;

  try {
    await callAwsApi({
      service: 'cognito-idp',
      target: 'AWSCognitoIdentityProviderService.AdminSetUserPassword',
      host: `cognito-idp.${REGION}.amazonaws.com`,
      payload: {
        UserPoolId: USER_POOL_ID,
        Username: email.toLowerCase().trim(),
        Password: newPassword,
        Permanent: true
      }
    });
    console.log(`[Cognito] Updated password for ${email}`);
    return true;
  } catch (err) {
    console.warn(`[Cognito Warning] Could not update password in Cognito:`, err.message);
    return false;
  }
}

// ──────────────────────────────────────────────
// DynamoDB Marshalling & Helpers
// ──────────────────────────────────────────────

function marshalDynamoItem(obj) {
  const item = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      item[k] = { NULL: true };
    } else if (typeof v === 'string') {
      item[k] = { S: v };
    } else if (typeof v === 'number') {
      item[k] = { N: v.toString() };
    } else if (typeof v === 'boolean') {
      item[k] = { BOOL: v };
    }
  }
  return item;
}

function unmarshalDynamoItem(item) {
  if (!item) return null;
  const result = {};
  for (const [k, v] of Object.entries(item)) {
    if (v.S !== undefined) result[k] = v.S;
    else if (v.N !== undefined) result[k] = Number(v.N);
    else if (v.BOOL !== undefined) result[k] = v.BOOL;
    else if (v.NULL !== undefined) result[k] = null;
  }
  return result;
}

// ──────────────────────────────────────────────
// DynamoDB Users Operations (CampusConnect_Users)
// ──────────────────────────────────────────────

async function putUserInDynamoDB(user) {
  if (!isAwsConfigured()) return false;

  try {
    await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.PutItem',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: USERS_TABLE,
        Item: marshalDynamoItem(user)
      }
    });
    console.log(`[DynamoDB] Saved user ${user.email} to ${USERS_TABLE}`);
    return true;
  } catch (err) {
    console.error(`[DynamoDB Error] Failed to save user:`, err.message);
    throw err;
  }
}

async function findUserInDynamoDBByEmail(email) {
  if (!isAwsConfigured()) return null;

  try {
    const res = await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.Scan',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: USERS_TABLE,
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': { S: email.toLowerCase().trim() }
        }
      }
    });

    if (res.Items && res.Items.length > 0) {
      return unmarshalDynamoItem(res.Items[0]);
    }
    return null;
  } catch (err) {
    console.warn(`[DynamoDB Warning] Scan user by email failed:`, err.message);
    return null;
  }
}

async function findUserInDynamoDBByCollegeId(collegeId) {
  if (!isAwsConfigured()) return null;

  try {
    const res = await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.Scan',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: USERS_TABLE,
        FilterExpression: 'collegeId = :cid',
        ExpressionAttributeValues: {
          ':cid': { S: collegeId.toUpperCase().trim() }
        }
      }
    });

    if (res.Items && res.Items.length > 0) {
      return unmarshalDynamoItem(res.Items[0]);
    }
    return null;
  } catch (err) {
    console.warn(`[DynamoDB Warning] Scan user by collegeId failed:`, err.message);
    return null;
  }
}

async function updateDynamoDBPassword(userId, hashedPassword) {
  if (!isAwsConfigured()) return false;

  try {
    await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.UpdateItem',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: USERS_TABLE,
        Key: { userId: { S: userId } },
        UpdateExpression: 'SET #pwd = :pwd',
        ExpressionAttributeNames: { '#pwd': 'password' },
        ExpressionAttributeValues: { ':pwd': { S: hashedPassword } }
      }
    });
    console.log(`[DynamoDB] Updated password for userId ${userId}`);
    return true;
  } catch (err) {
    console.warn(`[DynamoDB Warning] Update password failed:`, err.message);
    return false;
  }
}

// ──────────────────────────────────────────────
// DynamoDB Items Operations (CampusConnect_Items)
// ──────────────────────────────────────────────

async function putItemInDynamoDB(item) {
  if (!isAwsConfigured()) return false;

  try {
    await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.PutItem',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: ITEMS_TABLE,
        Item: marshalDynamoItem(item)
      }
    });
    console.log(`[DynamoDB] Saved item ${item.itemName} (${item.reportId}) to ${ITEMS_TABLE}`);
    return true;
  } catch (err) {
    console.warn(`[DynamoDB Warning] Failed to put item:`, err.message);
    return false;
  }
}

async function updateItemInDynamoDB(reportId, updates) {
  if (!isAwsConfigured()) return false;

  try {
    const exprAttrNames = {};
    const exprAttrValues = {};
    const updateClauses = [];

    for (const [k, v] of Object.entries(updates)) {
      if (k === 'reportId') continue;
      exprAttrNames[`#${k}`] = k;
      if (v === null || v === undefined) {
        exprAttrValues[`:${k}`] = { NULL: true };
      } else if (typeof v === 'string') {
        exprAttrValues[`:${k}`] = { S: v };
      } else if (typeof v === 'number') {
        exprAttrValues[`:${k}`] = { N: v.toString() };
      } else if (typeof v === 'boolean') {
        exprAttrValues[`:${k}`] = { BOOL: v };
      }
      updateClauses.push(`#${k} = :${k}`);
    }

    if (updateClauses.length === 0) return true;

    await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.UpdateItem',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: ITEMS_TABLE,
        Key: { reportId: { S: reportId } },
        UpdateExpression: `SET ${updateClauses.join(', ')}`,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues
      }
    });
    return true;
  } catch (err) {
    console.warn(`[DynamoDB Warning] Failed to update item:`, err.message);
    return false;
  }
}

async function deleteItemFromDynamoDB(reportId) {
  if (!isAwsConfigured()) return false;

  try {
    await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.DeleteItem',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: ITEMS_TABLE,
        Key: { reportId: { S: reportId } }
      }
    });
    return true;
  } catch (err) {
    console.warn(`[DynamoDB Warning] Failed to delete item:`, err.message);
    return false;
  }
}

// ──────────────────────────────────────────────
// DynamoDB Claims Operations (CampusConnect_Claims)
// ──────────────────────────────────────────────

async function putClaimInDynamoDB(claim) {
  if (!isAwsConfigured()) return false;

  try {
    await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.PutItem',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: CLAIMS_TABLE,
        Item: marshalDynamoItem(claim)
      }
    });
    console.log(`[DynamoDB] Saved claim ${claim.claimId} to ${CLAIMS_TABLE}`);
    return true;
  } catch (err) {
    console.warn(`[DynamoDB Warning] Failed to put claim:`, err.message);
    return false;
  }
}

async function updateClaimInDynamoDB(claimId, updates) {
  if (!isAwsConfigured()) return false;

  try {
    const exprAttrNames = {};
    const exprAttrValues = {};
    const updateClauses = [];

    for (const [k, v] of Object.entries(updates)) {
      if (k === 'claimId') continue;
      exprAttrNames[`#${k}`] = k;
      if (v === null || v === undefined) {
        exprAttrValues[`:${k}`] = { NULL: true };
      } else if (typeof v === 'string') {
        exprAttrValues[`:${k}`] = { S: v };
      } else if (typeof v === 'number') {
        exprAttrValues[`:${k}`] = { N: v.toString() };
      } else if (typeof v === 'boolean') {
        exprAttrValues[`:${k}`] = { BOOL: v };
      }
      updateClauses.push(`#${k} = :${k}`);
    }

    if (updateClauses.length === 0) return true;

    await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.UpdateItem',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: {
        TableName: CLAIMS_TABLE,
        Key: { claimId: { S: claimId } },
        UpdateExpression: `SET ${updateClauses.join(', ')}`,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues
      }
    });
    return true;
  } catch (err) {
    console.warn(`[DynamoDB Warning] Failed to update claim:`, err.message);
    return false;
  }
}

// ──────────────────────────────────────────────
// Server Startup Cloud Hydration
// ──────────────────────────────────────────────

/**
 * Loads all users, items, and claims from Amazon DynamoDB tables on startup.
 * Ensures data is preserved across Render server reboots!
 */
async function hydrateFromDynamoDB({ users, items, claims }) {
  if (!isAwsConfigured()) {
    console.log('[Cloud Hydration] AWS credentials not configured. Using local mock data.');
    return;
  }

  try {
    console.log('[Cloud Hydration] ⏳ Hydrating state from live AWS DynamoDB tables...');

    // 1. Hydrate Users
    const usersRes = await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.Scan',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: { TableName: USERS_TABLE }
    });
    if (usersRes.Items && usersRes.Items.length > 0) {
      for (const raw of usersRes.Items) {
        const u = unmarshalDynamoItem(raw);
        if (u && u.userId) {
          const existing = users.get(u.userId);
          if (existing && existing.email && existing.email !== u.email) {
            users.set(`mock_${existing.email}`, existing);
          }
          users.set(u.userId, u);
        }
      }
      console.log(`[Cloud Hydration] ✅ Loaded ${usersRes.Items.length} user(s) from ${USERS_TABLE}`);
    }

    // 2. Hydrate Items
    const itemsRes = await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.Scan',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: { TableName: ITEMS_TABLE }
    });
    if (itemsRes.Items && itemsRes.Items.length > 0) {
      for (const raw of itemsRes.Items) {
        const item = unmarshalDynamoItem(raw);
        if (item && item.reportId) {
          // If in-memory already has it, keep or merge; else set
          if (!items.has(item.reportId)) {
            items.set(item.reportId, item);
          }
        }
      }
      console.log(`[Cloud Hydration] ✅ Loaded ${itemsRes.Items.length} item(s) from ${ITEMS_TABLE}`);
    }

    // 3. Hydrate Claims
    const claimsRes = await callAwsApi({
      service: 'dynamodb',
      target: 'DynamoDB_20120810.Scan',
      host: `dynamodb.${REGION}.amazonaws.com`,
      payload: { TableName: CLAIMS_TABLE }
    });
    if (claimsRes.Items && claimsRes.Items.length > 0) {
      for (const raw of claimsRes.Items) {
        const claim = unmarshalDynamoItem(raw);
        if (claim && claim.claimId) {
          claims.set(claim.claimId, claim);
        }
      }
      console.log(`[Cloud Hydration] ✅ Loaded ${claimsRes.Items.length} claim(s) from ${CLAIMS_TABLE}`);
    }

    console.log('[Cloud Hydration] 🎉 Finished syncing live AWS cloud state!');
  } catch (err) {
    console.warn(`[Cloud Hydration Warning] Failed to fully hydrate from DynamoDB:`, err.message);
  }
}

module.exports = {
  isAwsConfigured,
  registerUserInCognito,
  setCognitoPassword,
  putUserInDynamoDB,
  findUserInDynamoDBByEmail,
  findUserInDynamoDBByCollegeId,
  updateDynamoDBPassword,
  putItemInDynamoDB,
  updateItemInDynamoDB,
  deleteItemFromDynamoDB,
  putClaimInDynamoDB,
  updateClaimInDynamoDB,
  hydrateFromDynamoDB
};