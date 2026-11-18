import { compressImage } from './imageCompress';
import { api } from './api';

export const realtimeEnabled = true;

// Upload through the Alabiq API using a short-lived, operation-specific
// grant. The legacy bucket/path arguments remain in the call shape so every
// upload screen can migrate without changing its business flow.
export async function uploadProofFile(_bucket, _path, grant, file) {
  const payload = await compressImage(file);
  await api.uploadFile(grant, payload);
  return true;
}
