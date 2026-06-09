import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../firebase/config.js';
import { sendPhoneLinkSms, disposeRecaptchaVerifier } from '../services/phoneAuthService.js';
import { RECAPTCHA_CONTAINER_ID, RECAPTCHA_VISIBLE_FALLBACK_ID } from '../constants/phoneAuth.js';

/**
 * Firebase phone link flow: one RecaptchaVerifier at a time, confirmation + challenge key for OTP UI.
 * @returns {{
 *   phoneConfirmation: import('firebase/auth').ConfirmationResult | null,
 *   smsChallengeKey: number,
 *   sendPhoneLink: (user: import('firebase/auth').User, e164: string, containerId?: string) => Promise<import('firebase/auth').ConfirmationResult>,
 *   resetPhoneFlow: () => void,
 * }}
 */
export function usePhoneVerificationLink() {
    const recaptchaVerifierRef = useRef(null);
    const [phoneConfirmation, setPhoneConfirmation] = useState(null);
    const [smsChallengeKey, setSmsChallengeKey] = useState(0);

    useEffect(() => {
        return () => {
            void disposeRecaptchaVerifier(recaptchaVerifierRef.current);
            recaptchaVerifierRef.current = null;
        };
    }, []);

    const resetPhoneFlow = useCallback(() => {
        void disposeRecaptchaVerifier(recaptchaVerifierRef.current);
        recaptchaVerifierRef.current = null;
    }, []);

    const sendPhoneLink = useCallback(async (user, e164, containerId = RECAPTCHA_CONTAINER_ID) => {
        try {
            const { confirmationResult, recaptchaVerifier } = await sendPhoneLinkSms(
                auth,
                user,
                e164,
                containerId,
                recaptchaVerifierRef.current,
                RECAPTCHA_VISIBLE_FALLBACK_ID
            );
            recaptchaVerifierRef.current = recaptchaVerifier;
            setPhoneConfirmation(confirmationResult);
            setSmsChallengeKey((k) => k + 1);
            return confirmationResult;
        } catch (e) {
            resetPhoneFlow();
            throw e;
        }
    }, [resetPhoneFlow]);

    return {
        phoneConfirmation,
        smsChallengeKey,
        sendPhoneLink,
        resetPhoneFlow,
    };
}
