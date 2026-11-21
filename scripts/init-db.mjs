import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";

try { loadEnvFile(".env.local"); } catch { /* Shell variables can be used when no local env file exists. */ }
try { loadEnvFile(".env.db.local"); } catch { /* Shell variables can be used when no local env file exists. */ }

const host = process.env.MYSQL_HOST ?? "127.0.0.1";
const port = process.env.MYSQL_PORT ?? "3306";
const user = process.env.MYSQL_ADMIN_USER ?? "root";
const schema = new URL("../database/schema.sql", import.meta.url);
const sql = await readFile(schema, "utf8");
const args = [`--host=${host}`, `--port=${port}`, `--user=${user}`, "--default-character-set=utf8mb4"];
const password = process.env.MYSQL_ROOT_PASSWORD;
if (password) args.push(`--password=${password}`);
const cli = process.env.MYSQL_CLI_PATH ?? (process.platform === "win32" ? "mysql.exe" : "mysql");
const child = spawn(cli, args, { stdio: ["pipe", "inherit", "inherit"], env: { ...process.env, ...(password ? { MYSQL_PWD: password } : {}) } });
child.stdin.end(sql);
child.on("error", (error) => { console.error(`Could not start ${cli}: ${error.message}. Add MySQL bin to PATH.`); process.exitCode = 1; });
child.on("exit", (code) => { if (code !== 0) process.exitCode = code ?? 1; else console.log("ChargePilot schema initialized."); });
