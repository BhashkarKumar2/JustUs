import { useEffect, useRef, useCallback } from 'react';
import CryptoService from '../services/crypto';
import { exchangePublicKey, getPublicKey } from '../services/socket';

/**
 * Hook to manage E2EE keypair for a user
 * Generates keypair on first load, stores in localStorage
 */
export default function useEncryption() {
  const keyPairRef = useRef(null);

  // Generate or retrieve keypair
  useEffect(() => {
    const stored = localStorage.getItem('user:crypto:keypair');
    if (stored) {
      try {
        keyPairRef.current = JSON.parse(stored);
        console.log('Loaded keypair from localStorage');
      } catch (e) {
        console.error('Failed to parse stored keypair:', e);
        keyPairRef.current = CryptoService.generateKeyPair();
        localStorage.setItem('user:crypto:keypair', JSON.stringify(keyPairRef.current));
      }
    } else {
      console.log('Generating new keypair');
      keyPairRef.current = CryptoService.generateKeyPair();
      localStorage.setItem('user:crypto:keypair', JSON.stringify(keyPairRef.current));
    }
  }, []);

  // Exchange public key with server
  const exchangeKey = useCallback(() => {
    if (keyPairRef.current) {
      exchangePublicKey(keyPairRef.current);
    }
  }, []);

  // Encrypt a message
  const encryptMessage = useCallback((plaintext, receiverPublicKey) => {
    if (!keyPairRef.current || !receiverPublicKey) {
      console.error('Cannot encrypt - keypair or receiver public key missing');
      return null;
    }
    try {
      return CryptoService.encrypt(plaintext, keyPairRef.current.secretKey, receiverPublicKey);
    } catch (error) {
      console.error('Encryption failed:', error);
      return null;
    }
  }, []);

  // Decrypt a message
  const decryptMessage = useCallback((ciphertext, nonce, senderPublicKey) => {
    if (!keyPairRef.current) {
      console.error('Cannot decrypt - keypair missing');
      return null;
    }
    try {
      return CryptoService.decrypt(ciphertext, nonce, senderPublicKey, keyPairRef.current.secretKey);
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }, []);

  const getKeyPair = useCallback(() => keyPairRef.current, []);
  const getPublicKeyForUser = useCallback((userId) => getPublicKey(userId), []);

  return {
    exchangeKey,
    encryptMessage,
    decryptMessage,
    getKeyPair,
    getPublicKeyForUser
  };
}
