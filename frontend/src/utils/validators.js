/**
 * Centralized Validation Patterns and Helpers
 */

export const VALIDATION_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    /** Pakistan mobile in forms: 03 + 9 digits (E.164: +923…) */
    PHONE: /^03\d{9}$/,
    CNIC: /^\d{5}-\d{7}-\d{1}$/,

    // At least 8 characters, one letter and one number

    PASSWORD: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/
};

export const validateEmail = (email) => VALIDATION_PATTERNS.EMAIL.test(email);
export const validatePhone = (phone) => VALIDATION_PATTERNS.PHONE.test(phone);
export const validateCNIC = (cnic) => VALIDATION_PATTERNS.CNIC.test(cnic);
export const validatePassword = (password) => VALIDATION_PATTERNS.PASSWORD.test(password);
