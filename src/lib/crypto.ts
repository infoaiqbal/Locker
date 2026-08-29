import CryptoJS from 'crypto-js';

export function encryptContent(content: string, secretKey: string): string {
  return CryptoJS.AES.encrypt(content, secretKey).toString();
}

export function decryptContent(ciphertext: string, secretKey: string): string | null {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || null;
  } catch (error) {
    return null;
  }
}
