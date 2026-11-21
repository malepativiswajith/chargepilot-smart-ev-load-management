import mysql, { type Pool, type PoolConnection } from "mysql2/promise";

declare global { var chargePilotPool: Pool | undefined; }

export function getPool(): Pool {
  if (!global.chargePilotPool) {
    global.chargePilotPool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE ?? "chargepilot",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true,
      enableKeepAlive: true,
    });
  }
  return global.chargePilotPool;
}

export async function inTransaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
