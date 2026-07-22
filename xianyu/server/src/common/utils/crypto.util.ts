import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

/**
 * AES-256-GCM 对称加解密工具。
 * 用于加密敏感数据（如闲鱼账号 Cookie）。
 *
 * 设计要点：
 * - 主密钥来自环境变量（hex），但会用 scrypt 派生为 32 字节密钥，增加破解难度
 * - 每次加密生成随机 IV（12 字节），保证相同明文密文不同
 * - AuthTag (16 字节) 用于校验密文完整性，防止篡改
 * - 存储格式: base64(iv) : base64(authTag) : base64(ciphertext)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 12 字节
const KEY_LENGTH = 32; // AES-256
const AUTH_TAG_LENGTH = 16;
const SALT = 'xianyu_autodeliver_v1_salt'; // 固定盐：派生密钥稳定，主密钥仍由环境变量保证安全

/**
 * 把环境变量里的主密钥（hex 或明文）派生为 32 字节 AES 密钥。
 */
function deriveKey(masterKey: string): Buffer {
  return scryptSync(masterKey, SALT, KEY_LENGTH);
}

/**
 * 加密明文，返回 "iv:authTag:ciphertext" 格式的字符串（均 base64）。
 * @param plaintext 待加密的明文
 * @param masterKey 主密钥（来自 COOKIE_ENCRYPTION_KEY 环境变量）
 */
export function encrypt(plaintext: string, masterKey: string): string {
  if (!masterKey) {
    throw new Error('加密主密钥未配置 (COOKIE_ENCRYPTION_KEY)');
  }
  const key = deriveKey(masterKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/**
 * 解密 encrypt() 产出的密文字符串。
 * 若密钥错误或密文被篡改，getAuthTag 校验会抛错。
 */
export function decrypt(payload: string, masterKey: string): string {
  if (!masterKey) {
    throw new Error('加密主密钥未配置 (COOKIE_ENCRYPTION_KEY)');
  }
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('密文格式错误');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;

  const key = deriveKey(masterKey);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// 导出常量供其他模块引用
export const CRYPTO_CONSTANTS = {
  ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
};
