import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import type { AuthenticatedUser } from "../../session";

const COLLECTION = "staff_signatures";
/** A drawn signature is a few KB; this keeps a pasted photo out. */
const MAX_LENGTH = 400_000;

const signatures = () => mongoConnection.getDb().collection<{ _id: string; data_url: string; updated_at: Date }>(COLLECTION);

/** The signature a staff member saved, to stamp on the bookings they check in. Null when they have none. */
export const signatureOf = async (userId: string): Promise<string | null> => {
  const doc = await signatures().findOne({ _id: String(userId) });
  return doc?.data_url ?? null;
};

class StaffSignatureService {
  async handle(request: { action?: string; dataUrl?: unknown }, user: AuthenticatedUser) {
    const id = String(user.id);
    switch (request?.action) {
      case "get":
        return { signature: await signatureOf(id), name: user.name };
      case "set": {
        const dataUrl = typeof request.dataUrl === "string" ? request.dataUrl.trim() : "";
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new HttpError(400, "Draw your signature first.");
        if (dataUrl.length > MAX_LENGTH) throw new HttpError(400, "That signature is too large. Draw it again, smaller.");
        await signatures().updateOne({ _id: id }, { $set: { data_url: dataUrl, updated_at: new Date() } }, { upsert: true });
        return { signature: dataUrl, name: user.name };
      }
      case "clear":
        await signatures().deleteOne({ _id: id });
        return { signature: null, name: user.name };
      default:
        throw new HttpError(400, "Invalid action");
    }
  }
}

export const staffSignatureService = new StaffSignatureService();
