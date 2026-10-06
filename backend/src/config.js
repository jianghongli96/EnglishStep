import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = join(__dirname, "..", "data");
export const SEED_PATH = join(DATA_DIR, "seed.json");

loadEnvFile(join(__dirname, "..", ".env"));

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

export const DB_PATH = resolveBackendPath(
  process.env.DB_PATH,
  join(DATA_DIR, "english-learning.db"),
);
export const PORT = Number(process.env.PORT || 4000);
export const HOST = process.env.HOST || "127.0.0.1";
export const AUTH_SECRET = requireConfig("AUTH_SECRET");
export const CORS_ORIGIN = requireConfig("CORS_ORIGIN");
export const ALLOW_LEGACY_STUDENTS = process.env.ALLOW_LEGACY_STUDENTS === "true";
export const ALLOW_LEGACY_LOGIN = process.env.ALLOW_LEGACY_LOGIN === "true";
export const AUTO_SEED_DATABASE = process.env.AUTO_SEED_DATABASE !== "false";
export const AUTO_SUPPLEMENTAL_QUESTIONS =
  process.env.AUTO_SUPPLEMENTAL_QUESTIONS !== "false";
export const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 8);

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireConfig(name) {
  const value = process.env[name];
  if (value) return value;

  if (isProduction) {
    throw new Error(`${name} must be configured when NODE_ENV=production`);
  }

  if (name === "AUTH_SECRET") {
    return "local-development-auth-secret";
  }
  if (name === "CORS_ORIGIN") {
    return "http://localhost:3001";
  }

  throw new Error(`${name} is required`);
}

function resolveBackendPath(value, fallback) {
  if (!value) return fallback;
  return isAbsolute(value) ? value : join(__dirname, "..", value);
}
