import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { Job } from "../models/Job.js";
import { KitModel } from "../models/Kit.js";

let server: MongoMemoryServer | undefined;

/**
 * Starts an in-memory MongoDB and connects mongoose to it — real Mongo
 * semantics, zero external dependency in tests. Mongoose builds schema
 * indexes asynchronously in the background after a model is first used;
 * `Model.init()` is the promise that resolves once they actually exist —
 * without waiting for it, a unique-index test can race ahead of the
 * index's own creation and see it as not-yet-enforced.
 */
export async function startTestDb(): Promise<void> {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  await Promise.all([User.init(), Session.init(), Job.init(), KitModel.init()]);
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  await server?.stop();
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
