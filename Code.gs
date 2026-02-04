/**
 * Google Apps Script: Drive → S3 Document Upload
 *
 * Reads PDFs from a Google Drive folder, maps them to contacts via reference number,
 * uploads to S3 with CRM folder structure.
 *
 * S3 format: {first_name}_{last_name}_{id}/Documents/{filename}
 * PDF format: {reference}-{Name}-{Type}.pdf
 *
 * Handles 10k+ files via automatic continuation (6-min Apps Script limit).
 *
 * SETUP:
 *   1. Go to script.google.com → New Project
 *   2. Paste this entire file into Code.gs
 *   3. Fill in CONFIG below (AWS keys)
 *   4. Run setup() first to test connections
 *   5. Run startUpload() to begin processing
 */

// ===== CONFIGURATION (FILL THESE IN) ==========================================
var CONFIG = {
  // Google Drive folder with PDFs
  DRIVE_FOLDER_ID: '1A3VxBI6d_zSjkbrUFZ1X1dO4F69hDQ8a',

  // CRM Server (provides contact reference map)
  CRM_SERVER_URL: 'https://rowanroseclaims.co.uk',

  // AWS
  AWS_ACCESS_KEY: PropertiesService.getScriptProperties().getProperty('AWS_ACCESS_KEY'),
  AWS_SECRET_KEY: PropertiesService.getScriptProperties().getProperty('AWS_SECRET_KEY'),
  AWS_REGION:     'eu-north-1',
  S3_BUCKET:      'client.landing.page',

  // Timing
  MAX_RUNTIME_MS: 5 * 60 * 1000,   // 5 min per run (1 min buffer before 6-min limit)
  DELAY_BETWEEN_FILES_MS: 200      // avoid S3 rate-limits
};


// ===== ENTRY POINTS ===========================================================

/** Test connections before starting */
function setup() {
  Logger.log('--- Setup ---');

  // Test Drive
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  Logger.log('Drive folder OK: ' + folder.getName());
  var count = 0;
  var iter = folder.getFilesByType(MimeType.PDF);
  while (iter.hasNext()) { iter.next(); count++; }
  Logger.log('PDF files found: ' + count);

  // Test S3
  Logger.log('Testing S3 with HEAD on bucket root...');
  try {
    var resp = s3Request('HEAD', 'test-connection-probe', null);
    Logger.log('S3 response code: ' + resp.getResponseCode() + ' (404 = OK, bucket reachable)');
  } catch (e) {
    Logger.log('S3 error: ' + e.message);
  }

  // Test CRM Server (contact reference map)
  Logger.log('Testing CRM server...');
  try {
    var contactMap = loadContactMap_();
    var contactCount = Object.keys(contactMap).length;
    Logger.log('CRM server OK: ' + contactCount + ' contacts with references loaded.');
  } catch (e) {
    Logger.log('CRM server error: ' + e.message);
    Logger.log('Make sure the server is running at: ' + CONFIG.CRM_SERVER_URL);
  }

  Logger.log('--- Setup complete. Run startUpload() to begin. ---');
}

/** Start fresh upload (clears any previous state) */
function startUpload() {
  resetState();
  Logger.log('Starting fresh upload...');
  processFiles_();
}

/** Continues from where we left off (called by trigger) */
function continueUpload() {
  Logger.log('Continuing upload...');
  processFiles_();
}

/** Show current progress */
function checkProgress() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('Current index: ' + (props.getProperty('currentIndex') || '0'));
  Logger.log('Success count: ' + (props.getProperty('successCount') || '0'));
  Logger.log('Skip count:    ' + (props.getProperty('skipCount') || '0'));
  Logger.log('Error count:   ' + (props.getProperty('errorCount') || '0'));
  Logger.log('Status:        ' + (props.getProperty('status') || 'not started'));
}

/** Clear all state and triggers */
function resetState() {
  var props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  deleteTriggers_();
  Logger.log('State cleared.');
}


// ===== CORE PROCESSING ========================================================

function processFiles_() {
  var startTime = Date.now();
  var props = PropertiesService.getScriptProperties();

  // Restore counters
  var successCount = parseInt(props.getProperty('successCount') || '0');
  var skipCount    = parseInt(props.getProperty('skipCount') || '0');
  var errorCount   = parseInt(props.getProperty('errorCount') || '0');
  var currentIndex = parseInt(props.getProperty('currentIndex') || '0');

  props.setProperty('status', 'running');

  // In-memory log buffers (flushed to Drive before exit)
  var successBuf = [];
  var errorBuf   = [];

  // 1. Get or create logs folder
  var logsFolder = getOrCreateLogsFolder_();

  // 2. Load already-uploaded references from tracker file
  var uploadedRefs = loadUploadedRefs_(logsFolder);
  Logger.log('Already uploaded references: ' + Object.keys(uploadedRefs).length);

  // 3. Load contact map from CRM server
  var contactMap = {};
  try {
    contactMap = loadContactMap_();
    Logger.log('Loaded ' + Object.keys(contactMap).length + ' contacts from CRM server.');
  } catch (e) {
    Logger.log('FATAL: Could not load contacts from CRM server: ' + e.message);
    Logger.log('Aborting. Make sure the server is running at: ' + CONFIG.CRM_SERVER_URL);
    props.setProperty('status', 'error - could not load contacts');
    return;
  }

  // 4. List all PDFs sorted by name (stable ordering across continuations)
  var files = listPDFs_();
  Logger.log('Total PDFs: ' + files.length + ', starting from index: ' + currentIndex);

  if (currentIndex >= files.length) {
    Logger.log('All files already processed!');
    finalize_(logsFolder, successCount, skipCount, errorCount, files.length);
    return;
  }

  // 5. Process files
  for (var i = currentIndex; i < files.length; i++) {

    // Time check — leave buffer for flushing logs
    if (Date.now() - startTime > CONFIG.MAX_RUNTIME_MS) {
      Logger.log('Time limit approaching. Saving state at index ' + i);
      props.setProperty('currentIndex', i.toString());
      props.setProperty('successCount', successCount.toString());
      props.setProperty('skipCount', skipCount.toString());
      props.setProperty('errorCount', errorCount.toString());
      flushLogs_(logsFolder, successBuf, errorBuf);
      scheduleContinuation_();
      return;
    }

    var file = files[i];
    var filename = file.getName();
    var result = processOneFile_(file, filename, contactMap, uploadedRefs);

    if (result.status === 'SUCCESS') {
      successCount++;
      successBuf.push(result);
      // Track this reference as uploaded
      if (result.reference) {
        uploadedRefs[result.reference] = true;
        appendToTracker_(logsFolder, result.reference);
      }
      Logger.log('[' + (i+1) + '/' + files.length + '] OK: ' + filename);
    } else if (result.status === 'SKIPPED') {
      skipCount++;
      successBuf.push(result);
      Logger.log('[' + (i+1) + '/' + files.length + '] SKIP: ' + filename);
    } else {
      errorCount++;
      errorBuf.push(result);
      Logger.log('[' + (i+1) + '/' + files.length + '] FAIL: ' + filename + ' — ' + result.error);
    }

    // Throttle
    if (CONFIG.DELAY_BETWEEN_FILES_MS > 0) {
      Utilities.sleep(CONFIG.DELAY_BETWEEN_FILES_MS);
    }
  }

  // All done
  props.setProperty('currentIndex', files.length.toString());
  props.setProperty('successCount', successCount.toString());
  props.setProperty('skipCount', skipCount.toString());
  props.setProperty('errorCount', errorCount.toString());
  flushLogs_(logsFolder, successBuf, errorBuf);
  finalize_(logsFolder, successCount, skipCount, errorCount, files.length);
}

function processOneFile_(file, filename, contactMap, uploadedRefs) {
  try {
    // 1. Extract reference
    var ref = extractReference_(filename);
    if (!ref) {
      return { filename: filename, status: 'ERROR', error: 'No reference number in filename', timestamp: new Date().toISOString() };
    }

    // 2. Skip if already uploaded (tracked in uploaded.txt)
    if (uploadedRefs[ref]) {
      return { filename: filename, reference: ref, status: 'SKIPPED', error: 'Already uploaded', timestamp: new Date().toISOString() };
    }

    // 3. Get contact info — MUST exist in database
    var contact = contactMap[ref] || null;

    if (!contact) {
      return { filename: filename, reference: ref, status: 'ERROR', error: 'No contact found for reference: ' + ref, timestamp: new Date().toISOString() };
    }

    // 4. Build S3 key: {first_name}_{last_name}_{id}/Documents/{filename}
    var s3Key = contact.first_name + '_' + contact.last_name + '_' + contact.id + '/Documents/' + filename;

    // 5. Download from Drive
    var blob = file.getBlob();

    // 6. Upload to S3
    var resp = s3Request('PUT', s3Key, blob.getBytes());
    var code = resp.getResponseCode();
    if (code !== 200 && code !== 201) {
      return { filename: filename, reference: ref, status: 'ERROR', error: 'S3 upload failed with HTTP ' + code + ': ' + resp.getContentText().substring(0, 200), timestamp: new Date().toISOString() };
    }

    var sizeKB = (blob.getBytes().length / 1024).toFixed(1);
    return { filename: filename, reference: ref, contactId: contact.id, contactName: contact.first_name + ' ' + contact.last_name, s3Key: s3Key, sizeKB: sizeKB, status: 'SUCCESS', timestamp: new Date().toISOString() };

  } catch (e) {
    return { filename: filename, status: 'ERROR', error: e.message, timestamp: new Date().toISOString() };
  }
}


// ===== CRM SERVER (CONTACT LOOKUP) =============================================

function loadContactMap_() {
  var url = CONFIG.CRM_SERVER_URL + '/api/contacts/reference-map';
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('CRM server returned HTTP ' + code + ': ' + response.getContentText().substring(0, 200));
  }

  return JSON.parse(response.getContentText());
}


// ===== AWS SIGNATURE V4 =======================================================

function s3Request(method, s3Key, payloadBytes) {
  var now = new Date();
  var dateStamp = Utilities.formatDate(now, 'UTC', 'yyyyMMdd');
  var amzDate   = Utilities.formatDate(now, 'UTC', "yyyyMMdd'T'HHmmss'Z'");

  // Path-style URL (bucket has dots, so virtual-hosted would break SSL)
  var host = 's3.' + CONFIG.AWS_REGION + '.amazonaws.com';
  var canonicalUri = '/' + CONFIG.S3_BUCKET + '/' + encodeS3Path_(s3Key);

  // Payload hash
  var payloadHash;
  if (method === 'PUT' && payloadBytes) {
    payloadHash = 'UNSIGNED-PAYLOAD';
  } else {
    payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // SHA-256 of empty
  }

  // Canonical headers (MUST be sorted alphabetically)
  var canonicalHeaders = '';
  var signedHeaders = '';

  if (method === 'PUT') {
    canonicalHeaders = 'content-type:application/pdf\n' +
                       'host:' + host + '\n' +
                       'x-amz-content-sha256:' + payloadHash + '\n' +
                       'x-amz-date:' + amzDate + '\n';
    signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  } else {
    canonicalHeaders = 'host:' + host + '\n' +
                       'x-amz-content-sha256:' + payloadHash + '\n' +
                       'x-amz-date:' + amzDate + '\n';
    signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  }

  // Canonical request
  var canonicalRequest = method + '\n' +
    canonicalUri + '\n' +
    '' + '\n' +               // query string (empty)
    canonicalHeaders + '\n' +
    signedHeaders + '\n' +
    payloadHash;

  // String to sign
  var credentialScope = dateStamp + '/' + CONFIG.AWS_REGION + '/s3/aws4_request';
  var stringToSign = 'AWS4-HMAC-SHA256\n' +
    amzDate + '\n' +
    credentialScope + '\n' +
    sha256Hex_(canonicalRequest);

  // Signing key
  var signingKey = getSignatureKey_(CONFIG.AWS_SECRET_KEY, dateStamp, CONFIG.AWS_REGION, 's3');
  var signature  = hmacSha256Hex_(signingKey, stringToSign);

  // Authorization header
  var authorization = 'AWS4-HMAC-SHA256 Credential=' + CONFIG.AWS_ACCESS_KEY + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  // Build request
  var headers = {
    'Authorization':        authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date':           amzDate
  };

  var options = {
    method:             method.toLowerCase(),
    headers:            headers,
    muteHttpExceptions: true,
    followRedirects:    false
  };

  if (method === 'PUT' && payloadBytes) {
    options.payload     = payloadBytes;
    options.contentType = 'application/pdf';
  }

  return UrlFetchApp.fetch('https://' + host + canonicalUri, options);
}


// ===== CRYPTO HELPERS =========================================================

function sha256Hex_(data) {
  var bytes = (typeof data === 'string') ? Utilities.newBlob(data).getBytes() : data;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return bytesToHex_(digest);
}

function hmacSha256_(key, data) {
  var dataBytes = (typeof data === 'string') ? Utilities.newBlob(data).getBytes() : data;
  return Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, dataBytes, key);
}

function hmacSha256Hex_(key, data) {
  return bytesToHex_(hmacSha256_(key, data));
}

function getSignatureKey_(secretKey, dateStamp, region, service) {
  var kDate    = hmacSha256_(Utilities.newBlob('AWS4' + secretKey).getBytes(), dateStamp);
  var kRegion  = hmacSha256_(kDate, region);
  var kService = hmacSha256_(kRegion, service);
  return hmacSha256_(kService, 'aws4_request');
}

function bytesToHex_(bytes) {
  return bytes.map(function(b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function encodeS3Path_(path) {
  return path.split('/').map(function(seg) {
    return encodeURIComponent(seg)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  }).join('/');
}


// ===== UPLOAD TRACKER ==========================================================

function loadUploadedRefs_(logsFolder) {
  var refs = {};
  var iter = logsFolder.getFilesByName('uploaded.txt');
  if (iter.hasNext()) {
    var content = iter.next().getBlob().getDataAsString();
    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var ref = lines[i].trim();
      if (ref) { refs[ref] = true; }
    }
  }
  return refs;
}

function appendToTracker_(logsFolder, ref) {
  var iter = logsFolder.getFilesByName('uploaded.txt');
  if (iter.hasNext()) {
    var file = iter.next();
    var existing = file.getBlob().getDataAsString();
    file.setContent(existing + ref + '\n');
  } else {
    logsFolder.createFile('uploaded.txt', ref + '\n', 'text/plain');
  }
}


// ===== FILENAME PARSING ========================================================

function extractReference_(filename) {
  var match = filename.match(/^\(?(\d+)\)?\s*[-–]/);
  return match ? match[1] : null;
}


// ===== DRIVE FILE LISTING ======================================================

function listPDFs_() {
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var iter = folder.getFilesByType(MimeType.PDF);
  var files = [];
  while (iter.hasNext()) {
    files.push(iter.next());
  }
  // Sort by name for stable ordering across continuations
  files.sort(function(a, b) {
    return a.getName().localeCompare(b.getName());
  });
  return files;
}


// ===== LOGGING =================================================================

function getOrCreateLogsFolder_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('logsFolderId');

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) { /* folder deleted, recreate */ }
  }

  var parent = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

  // Reuse existing MIGRATION folder if found, clear old logs
  var existing = parent.getFoldersByName('MIGRATION');
  if (existing.hasNext()) {
    var folder = existing.next();
    // Clear old log files (but keep uploaded.txt tracker)
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.getName() !== 'uploaded.txt') { f.setTrashed(true); }
    }
    props.setProperty('logsFolderId', folder.getId());
    return folder;
  }

  var logsFolder = parent.createFolder('MIGRATION');
  props.setProperty('logsFolderId', logsFolder.getId());
  return logsFolder;
}

function flushLogs_(folder, successBuf, errorBuf) {
  if (successBuf.length > 0) {
    appendLines_(folder, 'success_log.jsonl', successBuf);
  }
  if (errorBuf.length > 0) {
    appendLines_(folder, 'failed_log.jsonl', errorBuf);
  }
}

function appendLines_(folder, filename, entries) {
  var lines = entries.map(function(e) { return JSON.stringify(e); }).join('\n') + '\n';
  var iter = folder.getFilesByName(filename);
  if (iter.hasNext()) {
    var file = iter.next();
    var existing = file.getBlob().getDataAsString();
    file.setContent(existing + lines);
  } else {
    folder.createFile(filename, lines, 'text/plain');
  }
}

function finalize_(logsFolder, successCount, skipCount, errorCount, totalFiles) {
  // Write summary
  var summary = {
    totalFiles:    totalFiles,
    successful:    successCount,
    skipped:       skipCount,
    failed:        errorCount,
    completedAt:   new Date().toISOString()
  };
  logsFolder.createFile('summary.json', JSON.stringify(summary, null, 2), 'application/json');

  // Cleanup triggers
  deleteTriggers_();

  var props = PropertiesService.getScriptProperties();
  props.setProperty('status', 'completed');

  Logger.log('========================================');
  Logger.log('MIGRATION COMPLETE');
  Logger.log('Total:     ' + totalFiles);
  Logger.log('Success:   ' + successCount);
  Logger.log('Skipped:   ' + skipCount);
  Logger.log('Failed:    ' + errorCount);
  Logger.log('Logs:      ' + logsFolder.getUrl());
  Logger.log('========================================');
}


// ===== TRIGGER MANAGEMENT ======================================================

function scheduleContinuation_() {
  deleteTriggers_(); // remove old triggers first
  ScriptApp.newTrigger('continueUpload')
    .timeBased()
    .after(5000) // 5 seconds
    .create();
  Logger.log('Scheduled continuation trigger.');
}

function deleteTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'continueUpload') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
