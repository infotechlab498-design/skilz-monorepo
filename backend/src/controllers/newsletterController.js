import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../services/firebaseAdmin.js';
import { createHttpError } from '../middleware/errorHandler.js';
import { subscribeEmailToEsp, unsubscribeEmailFromEsp } from '../services/emailService.js';
import { normalizeNewsletterEmail } from '../utils/emailNormalizer.js';

const EMAIL_REGEX =
  /^(?=.{1,254}$)(?=.{1,64}@)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

function isValidEmail(email) {
  return EMAIL_REGEX.test(email);
}

function firestoreRequired() {
  const firestore = getAdminFirestore();
  if (!firestore) throw createHttpError(503, 'Firestore Admin is not configured');
  return firestore;
}

export async function subscribeNewsletter(req, res, next) {
  try {
    const email = normalizeNewsletterEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      throw createHttpError(400, 'Invalid email format');
    }

    const firestore = firestoreRequired();
    const subscriberRef = firestore.collection('newsletter_subscribers').doc(email);

    const created = await firestore.runTransaction(async (tx) => {
      const existing = await tx.get(subscriberRef);
      if (existing.exists) return false;

      tx.set(subscriberRef, {
        email,
        createdAt: FieldValue.serverTimestamp(),
        source: 'website',
        status: 'subscribed',
        espStatus: 'pending',
        espError: null,
      });
      return true;
    });

    if (!created) {
      return res.json({ success: true, message: 'Already subscribed' });
    }

    const espResult = await subscribeEmailToEsp(email);
    if (espResult.ok) {
      await subscriberRef.set(
        {
          espStatus: 'sent',
          espError: null,
        },
        { merge: true }
      );
    } else if (!espResult.skipped) {
      await subscriberRef.set(
        {
          espStatus: 'failed',
          espError: espResult.errorMessage || 'mailchimp_subscribe_failed',
        },
        { merge: true }
      );
    }

    return res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function unsubscribeNewsletter(req, res, next) {
  try {
    const email = normalizeNewsletterEmail(req.query?.email);
    if (!email || !isValidEmail(email)) {
      throw createHttpError(400, 'Invalid email format');
    }

    const firestore = firestoreRequired();
    const subscriberRef = firestore.collection('newsletter_subscribers').doc(email);
    const snap = await subscriberRef.get();
    if (!snap.exists) {
      return res.json({ success: true, message: 'Subscription already inactive' });
    }

    await subscriberRef.set(
      {
        status: 'unsubscribed',
        unsubscribedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const espResult = await unsubscribeEmailFromEsp(email);
    if (espResult.ok) {
      await subscriberRef.set(
        {
          espStatus: 'sent',
          espError: null,
        },
        { merge: true }
      );
    } else if (!espResult.skipped) {
      await subscriberRef.set(
        {
          espStatus: 'failed',
          espError: espResult.errorMessage || 'mailchimp_unsubscribe_failed',
        },
        { merge: true }
      );
    }

    return res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function getNewsletterSubscribers(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 50));
    const snap = await firestore
      .collection('newsletter_subscribers')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const subscribers = snap.docs.map((doc) => {
      const row = doc.data() || {};
      const createdAt =
        typeof row.createdAt?.toDate === 'function' ? row.createdAt.toDate().toISOString() : null;
      return {
        email: String(row.email || doc.id),
        source: String(row.source || 'website'),
        status: String(row.status || 'subscribed'),
        espStatus: String(row.espStatus || 'pending'),
        espError: row.espError ? String(row.espError) : null,
        createdAt,
      };
    });

    return res.json({ success: true, subscribers });
  } catch (error) {
    return next(error);
  }
}

export async function getNewsletterStats(_req, res, next) {
  try {
    const firestore = firestoreRequired();
    const snap = await firestore.collection('newsletter_subscribers').get();

    let active = 0;
    let unsubscribed = 0;
    let espFailed = 0;
    for (const doc of snap.docs) {
      const row = doc.data() || {};
      if (String(row.status || '') === 'unsubscribed') {
        unsubscribed += 1;
      } else {
        active += 1;
      }
      if (String(row.espStatus || '') === 'failed') {
        espFailed += 1;
      }
    }

    return res.json({
      success: true,
      stats: {
        total: snap.size,
        active,
        unsubscribed,
        espFailed,
      },
    });
  } catch (error) {
    return next(error);
  }
}
