import { MongoClient } from "mongodb";

declare global { var chargePilotMongo: Promise<MongoClient> | undefined; }

export async function getMongoDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!global.chargePilotMongo) {
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
    global.chargePilotMongo = client.connect().then(async (connected) => {
      const db = connected.db(process.env.MONGODB_DATABASE ?? "chargepilot");
      await db.collection("telemetry").createIndex({ chargerId: 1, recordedAt: -1 });
      await db.collection("telemetry").createIndex({ stationId: 1, recordedAt: -1 });
      return connected;
    });
  }
  return (await global.chargePilotMongo).db(process.env.MONGODB_DATABASE ?? "chargepilot");
}
