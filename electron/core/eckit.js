/**
 * EC Kit (Event Creator Kit) — webhook identity license verification.
 * Uses Ed25519 signatures for offline verification of .eckit license files.
 * No external dependencies — uses Node.js built-in crypto module.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Public key for verifying kit signatures (Ed25519, DER/SPKI hex-encoded).
// Production key as of v1.2.0; signed kits issued via the EC Kit purchase
// flow (Cloudflare Worker) verify against this. Rotating this constant
// invalidates all previously-issued kits — see the cleanup logic in
// loadKits() which auto-removes orphaned files after a rotation.
const PUBLIC_KEY_HEX = "302a300506032b657003210008044dd51eca1a9d9b806b1e08d337267185b7198282830131d4b8c4ad547da6";

// Hard caps on import. A real kit ZIP is ~6 KB (eckit JSON + license text);
// the eckit JSON itself is well under 1 KB. These bounds give large headroom
// for future license-text growth while preventing memory exhaustion from a
// crafted oversized file or a DEFLATE bomb in the ZIP path.
const MAX_KIT_FILE_BYTES = 256 * 1024;     // source file (.eckit or .zip)
const MAX_EXTRACTED_BYTES = 64 * 1024;     // decompressed .eckit JSON
// Group IDs always look like grp_<36-char id>. Anything else is rejected
// before being used as a destination filename — defense in depth against
// path traversal (would only matter if the signing key were compromised).
const GROUP_ID_RE = /^grp_[0-9a-fA-F-]{36}$/;

let publicKey;
try {
  publicKey = crypto.createPublicKey({
    key: Buffer.from(PUBLIC_KEY_HEX, "hex"),
    format: "der",
    type: "spki"
  });
} catch (err) {
  console.error("Failed to load EC Kit public key:", err.message);
}

// In-memory cache of verified kits, keyed by groupId
const verifiedKits = new Map();

/**
 * Read a file with a hard byte cap, using a single FD for the size check
 * and the read so there's no TOCTOU window between them. Throws if the
 * file exceeds the cap.
 * @param {string} filePath
 * @param {number} maxBytes
 * @returns {Buffer}
 */
function readFileBoundedSync(filePath, maxBytes) {
  const fd = fs.openSync(filePath, "r");
  try {
    const stat = fs.fstatSync(fd);
    if (stat.size > maxBytes) throw new Error("File exceeds maximum size.");
    const buffer = Buffer.alloc(stat.size);
    let bytesRead = 0;
    while (bytesRead < stat.size) {
      const n = fs.readSync(fd, buffer, bytesRead, stat.size - bytesRead, bytesRead);
      if (n <= 0) break;
      bytesRead += n;
    }
    return buffer;
  } finally {
    try { fs.closeSync(fd); } catch { /* best-effort */ }
  }
}

/**
 * Build the canonical payload string for signing/verification.
 * Fields are sorted alphabetically and joined with newlines.
 */
function canonicalize(kit) {
  const fields = {
    groupId: kit.groupId || "",
    issuedAt: kit.issuedAt || "",
    issuedTo: kit.issuedTo || "",
    v: String(kit.v || 1)
  };
  return Object.keys(fields).sort().map(k => `${k}:${fields[k]}`).join("\n");
}

/**
 * Verify an .eckit file's signature.
 * @param {object} kit - Parsed kit JSON
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyKit(kit) {
  if (!publicKey) return { valid: false, error: "Public key not loaded." };
  if (!kit || typeof kit !== "object") return { valid: false, error: "Invalid kit format." };
  if (!kit.groupId) return { valid: false, error: "Missing groupId." };
  if (!kit.sig) return { valid: false, error: "Missing signature." };
  if (kit.v !== 1) return { valid: false, error: `Unsupported kit version: ${kit.v}` };

  try {
    const payload = canonicalize(kit);
    const signature = Buffer.from(kit.sig, "base64");
    const isValid = crypto.verify(null, Buffer.from(payload, "utf8"), publicKey, signature);
    if (!isValid) return { valid: false, error: "Invalid signature." };
    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${err.message}` };
  }
}

/**
 * Load and verify all .eckit files from a directory.
 * @param {string} kitsDir - Path to the kits directory
 * @returns {number} Number of valid kits loaded
 */
function loadKits(kitsDir) {
  verifiedKits.clear();
  if (!kitsDir || !fs.existsSync(kitsDir)) return 0;

  let count = 0;
  try {
    const files = fs.readdirSync(kitsDir).filter(f => f.endsWith(".eckit"));
    for (const file of files) {
      const filePath = path.join(kitsDir, file);
      let isValid = false;
      try {
        const raw = readFileBoundedSync(filePath, MAX_EXTRACTED_BYTES).toString("utf8");
        const kit = JSON.parse(raw);
        const result = verifyKit(kit);
        if (result.valid && kit.groupId) {
          verifiedKits.set(kit.groupId, {
            groupId: kit.groupId,
            issuedTo: kit.issuedTo || "",
            issuedAt: kit.issuedAt || "",
            filename: file
          });
          count++;
          isValid = true;
        }
      } catch {
        // Parse / read error — falls through to cleanup
      }
      if (!isValid) {
        // Orphaned kit (signature failure from a keypair rotation, parse
        // error, missing fields). Delete so the import button reappears
        // and the user can re-import a valid kit instead of being stuck
        // with a silently-skipped file. Best-effort delete; if the unlink
        // fails (permissions, file locked) we just leave it.
        try { fs.unlinkSync(filePath); } catch { /* best-effort */ }
      }
    }
  } catch {
    // Directory read error
  }
  return count;
}

/**
 * Extract the .eckit JSON content from a ZIP archive buffer.
 * The kit purchase flow ships kits inside a ZIP that also contains
 * LICENSE.txt — this lets us accept the ZIP directly without making
 * the buyer extract it first. STORE and DEFLATE methods supported.
 * @param {Buffer} buffer
 * @returns {string} The .eckit file contents as a UTF-8 string.
 */
function extractEckitFromZip(buffer) {
  // EOCD signature 0x06054b50, scanned backward (allows up to 65535-byte comment).
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - (22 + 65535));
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Not a valid ZIP archive.");

  const numEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  let pos = cdOffset;
  for (let i = 0; i < numEntries; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error("Corrupt central directory.");
    }
    const compressionMethod = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const filenameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const filename = buffer.toString("utf8", pos + 46, pos + 46 + filenameLen);

    if (filename.endsWith(".eckit") && !filename.includes("/") && !filename.includes("\\")) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error("Corrupt local header.");
      }
      const lhFilenameLen = buffer.readUInt16LE(localOffset + 26);
      const lhExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lhFilenameLen + lhExtraLen;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        if (compressed.length > MAX_EXTRACTED_BYTES) {
          throw new Error("Kit content exceeds maximum size.");
        }
        return compressed.toString("utf8");
      }
      if (compressionMethod === 8) {
        // maxOutputLength caps zlib's allocation — protects against DEFLATE bombs.
        const inflated = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_EXTRACTED_BYTES });
        return inflated.toString("utf8");
      }
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}.`);
    }

    pos += 46 + filenameLen + extraLen + commentLen;
  }
  throw new Error("No .eckit file found in archive.");
}

/**
 * Import an .eckit file (or a .zip containing one) — verify and copy to
 * kits directory.
 * @param {string} filePath - Path to the .eckit or .zip file to import
 * @param {string} kitsDir - Path to the kits directory
 * @returns {{ ok: boolean, groupId?: string, issuedTo?: string, error?: string }}
 */
function importKit(filePath, kitsDir) {
  try {
    let buffer;
    try {
      buffer = readFileBoundedSync(filePath, MAX_KIT_FILE_BYTES);
    } catch (err) {
      if (/exceeds maximum size/i.test(err.message)) {
        return { ok: false, error: "Kit file is too large." };
      }
      throw err;
    }
    // ZIP magic: PK\x03\x04 — local file header signature 0x04034b50 (LE).
    const isZip = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
    const raw = isZip ? extractEckitFromZip(buffer) : buffer.toString("utf8");
    if (raw.length > MAX_EXTRACTED_BYTES) {
      return { ok: false, error: "Kit content is too large." };
    }

    const kit = JSON.parse(raw);
    const result = verifyKit(kit);
    if (!result.valid) return { ok: false, error: result.error };
    // Defense in depth: even with a valid signature, never let groupId
    // escape the kits directory. A properly-issued kit always matches
    // the regex; this only triggers if our signing key is compromised.
    if (!GROUP_ID_RE.test(kit.groupId)) {
      return { ok: false, error: "Kit has an invalid group ID." };
    }

    fs.mkdirSync(kitsDir, { recursive: true });
    const destName = `${kit.groupId}.eckit`;
    fs.writeFileSync(path.join(kitsDir, destName), raw, "utf8");

    verifiedKits.set(kit.groupId, {
      groupId: kit.groupId,
      issuedTo: kit.issuedTo || "",
      issuedAt: kit.issuedAt || "",
      filename: destName
    });

    return { ok: true, groupId: kit.groupId, issuedTo: kit.issuedTo || "" };
  } catch (err) {
    return { ok: false, error: `Failed to import kit: ${err.message}` };
  }
}

/**
 * Check if a group has a valid kit loaded.
 * @param {string} groupId
 * @returns {boolean}
 */
function hasKit(groupId) {
  return verifiedKits.has(groupId);
}

/**
 * Get kit info for a group.
 * @param {string} groupId
 * @returns {{ groupId: string, issuedTo: string, issuedAt: string } | null}
 */
function getKit(groupId) {
  return verifiedKits.get(groupId) || null;
}

/**
 * Get all loaded kit group IDs.
 * @returns {string[]}
 */
function getKitGroupIds() {
  return Array.from(verifiedKits.keys());
}

module.exports = {
  loadKits,
  importKit,
  verifyKit,
  hasKit,
  getKit,
  getKitGroupIds
};
