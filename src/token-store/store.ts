import fs from 'fs/promises';
import path from 'path';
import { AccessTokenStore } from '../types';
import { logger } from '../utils/logger';

const STORE_PATH = path.join(process.cwd(), '.mcp_token_store.json');

export async function readTokens(): Promise<AccessTokenStore> {
  try {
    const data = await fs.readFile(STORE_PATH, 'utf-8');
    return JSON.parse(data) as AccessTokenStore;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {};
    }
    logger.error('Failed to read token store:', error);
    return {};
  }
}

export async function writeTokens(tokens: AccessTokenStore): Promise<void> {
  try {
    await fs.writeFile(STORE_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
    logger.info('Tokens successfully saved to store.');
  } catch (error) {
    logger.error('Failed to write to token store:', error);
  }
}

export async function saveUserAccessToken(token: string): Promise<void> {
  const current = await readTokens();
  current.user_access_token = token;
  await writeTokens(current);
}

export async function savePageAccessToken(pageId: string, token: string): Promise<void> {
  const current = await readTokens();
  if (!current.page_access_tokens) {
    current.page_access_tokens = {};
  }
  current.page_access_tokens[pageId] = token;
  await writeTokens(current);
}

export async function getUserAccessToken(): Promise<string | undefined> {
  const current = await readTokens();
  return current.user_access_token;
}

export async function getPageAccessToken(pageId: string): Promise<string | undefined> {
  const current = await readTokens();
  return current.page_access_tokens?.[pageId];
}
