/**
 * User profile API — Firestore `users/{uid}` + Storage profile images.
 * Prefer importing from here for signup, dashboard, and profile screens.
 */
import {
  getUserProfile,
  updateUserProfile,
  uploadProfileImage,
} from './profileApi.js';
import { createUserProfile as createUserProfileFirestore } from '../services/userProfileService.js';

/**
 * @param {Parameters<typeof createUserProfileFirestore>[0]} data
 */
export async function createUserProfile(data) {
  return createUserProfileFirestore(data);
}

export { getUserProfile, updateUserProfile, uploadProfileImage };
