import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createSession, findSession } from "./db/db.js";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SCRYPT_KEY_LENGTH = 64;
const DEV_SECRET = "dev-secret-change-me";

interface TokenPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: TokenPayload;
}

// Read lazily so values loaded by dotenv are always visible.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production.");
  }
  return DEV_SECRET;
}

export function assertAuthConfigured(): void {
  getJwtSecret();
}

/** Salted scrypt hash, stored as `scrypt$<salt hex>$<hash hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) {
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function createToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

/** Sessions are keyed by a hash of the token, so a leaked database does not leak usable tokens. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function saveSession(token: string, userId: string): void {
  const createdAt = new Date();
  createSession(hashToken(token), userId, createdAt, new Date(createdAt.getTime() + SESSION_TTL_MS));
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header." });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as TokenPayload;
    const session = findSession(hashToken(token));
    if (!session || session.userId !== payload.userId || new Date(session.expiresAt).getTime() <= Date.now()) {
      res.status(401).json({ error: "Session is invalid or expired." });
      return;
    }
    req.auth = payload;
    next();
  } catch (_error) {
    res.status(401).json({ error: "Token invalid or expired." });
  }
}
