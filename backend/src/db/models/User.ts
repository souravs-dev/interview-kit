import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = (mongoose.models.User as Model<UserDoc>) ?? model<UserDoc>("User", userSchema);
