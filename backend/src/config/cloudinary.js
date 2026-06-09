import { v2 as cloudinary } from 'cloudinary';

let configured = false;

export function configureCloudinary() {
  if (configured) return cloudinary;
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  configured = true;
  return cloudinary;
}

export function getCloudinary() {
  return configured ? cloudinary : configureCloudinary();
}

export function extractCloudinaryPublicId(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  const marker = '/upload/';
  const idx = value.indexOf(marker);
  if (idx < 0) return '';
  const afterUpload = value.slice(idx + marker.length);
  const withoutVersion = afterUpload.replace(/^v\d+\//, '');
  const noQuery = withoutVersion.split('?')[0];
  const lastDot = noQuery.lastIndexOf('.');
  if (lastDot <= 0) return noQuery;
  return noQuery.slice(0, lastDot);
}
