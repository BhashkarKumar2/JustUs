import nacl from 'tweetnacl';
import pkg from 'tweetnacl-util';
const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = pkg;
/**
 * Encryption service using TweetNaCl.js
 * Algorithm: ECDH (Curve25519) + XSalsa20-Poly1305
 * - Fast (XSalsa20 is optimized)
 * - Authenticated encryption (Poly1305 MAC)
 * - True end-to-end encryption
 */

class CryptoService {
  /**
   * Generate a keypair for a user
   * @returns {Object} { publicKey, secretKey } both as base64 strings
   */
  static generateKeyPair() {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      secretKey: encodeBase64(keyPair.secretKey)
    };
  }

  /**
   * Compute shared secret from sender's secret key and receiver's public key
   * @param {string} senderSecretKey - Base64 encoded secret key
   * @param {string} receiverPublicKey - Base64 encoded public key
   * @returns {Uint8Array} Shared secret
   */
  static computeSharedSecret(senderSecretKey, receiverPublicKey) {
    const secretKey = decodeBase64(senderSecretKey);
    const publicKey = decodeBase64(receiverPublicKey);
    return nacl.box.before(publicKey, secretKey);
  }

  /**
   * Encrypt a message
   * @param {string} plaintext - Message to encrypt
   * @param {Uint8Array} sharedSecret - Shared secret from computeSharedSecret
   * @returns {Object} { ciphertext, nonce } both as base64 strings
   */
  static encryptMessage(plaintext, sharedSecret) {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const message = encodeUTF8(plaintext);
    const ciphertext = nacl.box.after(message, nonce, sharedSecret);

    return {
      ciphertext: encodeBase64(ciphertext),
      nonce: encodeBase64(nonce)
    };
  }

  /**
   * Decrypt a message
   * @param {string} ciphertext - Base64 encoded ciphertext
   * @param {string} nonce - Base64 encoded nonce
   * @param {Uint8Array} sharedSecret - Shared secret
   * @returns {string} Decrypted plaintext
   */
  static decryptMessage(ciphertext, nonce, sharedSecret) {
    const ciphertextBytes = decodeBase64(ciphertext);
    const nonceBytes = decodeBase64(nonce);
    const plaintext = nacl.box.open.after(ciphertextBytes, nonceBytes, sharedSecret);

    if (!plaintext) {
      throw new Error('Decryption failed - message is corrupted or tampered with');
    }

    return decodeUTF8(plaintext);
  }

  /**
   * Encrypt for a specific user (all-in-one)
   * Uses box() instead of box.before() + box.after() for convenience
   * @param {string} plaintext - Message to encrypt
   * @param {string} senderSecretKey - Base64 encoded secret key
   * @param {string} receiverPublicKey - Base64 encoded public key
   * @returns {Object} { ciphertext, nonce } both as base64 strings
   */
  static encryptTo(plaintext, senderSecretKey, receiverPublicKey) {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const message = encodeUTF8(plaintext);
    const secretKey = decodeBase64(senderSecretKey);
    const publicKey = decodeBase64(receiverPublicKey);
    const ciphertext = nacl.box(message, nonce, publicKey, secretKey);

    return {
      ciphertext: encodeBase64(ciphertext),
      nonce: encodeBase64(nonce)
    };
  }

  /**
   * Decrypt from a specific user (all-in-one)
   * @param {string} ciphertext - Base64 encoded ciphertext
   * @param {string} nonce - Base64 encoded nonce
   * @param {string} senderPublicKey - Base64 encoded sender's public key
   * @param {string} receiverSecretKey - Base64 encoded receiver's secret key
   * @returns {string} Decrypted plaintext
   */
  static decryptFrom(ciphertext, nonce, senderPublicKey, receiverSecretKey) {
    const ciphertextBytes = decodeBase64(ciphertext);
    const nonceBytes = decodeBase64(nonce);
    const publicKey = decodeBase64(senderPublicKey);
    const secretKey = decodeBase64(receiverSecretKey);
    const plaintext = nacl.box.open(ciphertextBytes, nonceBytes, publicKey, secretKey);

    if (!plaintext) {
      throw new Error('Decryption failed - message is corrupted or tampered with');
    }

    return decodeUTF8(plaintext);
  }
}

export default CryptoService;
