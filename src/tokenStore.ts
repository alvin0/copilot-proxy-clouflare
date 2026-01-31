export type TokenRecord = {
  tempToken: string;
  expiry: number;
};

export const tokenStore = new Map<string, TokenRecord>();
