import { loadGoofishSdk } from './goofish-sdk.loader';

/** MessagePack 解密 — 委托 goofish-sdk decrypt */
export function decryptGoofishMessage(data: string): string {
  return loadGoofishSdk().decrypt(data);
}

export function decryptGoofishObject(data: string): Record<string, unknown> {
  return loadGoofishSdk().decryptObject(data);
}
