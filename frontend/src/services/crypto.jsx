import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

/**
 * Frontend Crypto Service
 * Mirrors backend CryptoService for client-side E2EE
 */

class CryptoService {
  static generateKeyPair() {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      secretKey: encodeBase64(keyPair.secretKey)
    };
  }

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

  /**
   * Encrypt message with sender and receiver keys
   * @param {string} plaintext
   * @param {string} senderSecretKey
   * @param {string} receiverPublicKey
   * @returns {Object} { ciphertext, nonce }
   */
  static encrypt(plaintext, senderSecretKey, receiverPublicKey) {
    return this.encryptTo(plaintext, senderSecretKey, receiverPublicKey);
  }

  /**
   * Decrypt message
   * @param {string} ciphertext
   * @param {string} nonce
   * @param {string} senderPublicKey
   * @param {string} receiverSecretKey
   * @returns {string} plaintext
   */
  static decrypt(ciphertext, nonce, senderPublicKey, receiverSecretKey) {
    return this.decryptFrom(ciphertext, nonce, senderPublicKey, receiverSecretKey);
  }
}

export default CryptoService;
