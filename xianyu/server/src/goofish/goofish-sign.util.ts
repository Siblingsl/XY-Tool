import { loadGoofishSdk } from './goofish-sdk.loader';

/** PC H5 mtop MD5 签名 — 委托 goofish-sdk generateSign */
export function generateGoofishSign(
  timestamp: string,
  token: string,
  data: string,
): string {
  return loadGoofishSdk().generateSign(timestamp, token, data);
}
