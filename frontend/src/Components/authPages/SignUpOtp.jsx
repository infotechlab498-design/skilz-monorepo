
import { useEffect, useRef, useState, useCallback } from "react";
import "./SignUpOtp.css";
import { useNavigate } from "react-router-dom";
import { mapFirebaseAuthError } from "../../services/firebaseAuth.js";
import { FIREBASE_OTP_RESEND_COOLDOWN_SEC } from "../../constants/phoneAuth.js";
import { authDiag } from "../../utils/authDiagnostics.js";

const showSmsDeliveryHelp = import.meta.env.VITE_SHOW_SMS_DELIVERY_HELP !== "false";

/**
 * @param {{
 *   onClose?: () => void,
 *   email?: string,
 *   mode?: string,
 *   onSuccess?: () => void,
 *   redirectTo?: string,
 *   firebaseMode?: boolean,
 *   confirmationResult?: import('firebase/auth').ConfirmationResult | null,
 *   onFirebaseVerified?: () => Promise<void>,
 *   onResendFirebase?: () => Promise<void>,
 *   smsChallengeKey?: number,
 *   badgeLabel?: string | null,
 * }} props
 */
const VerifyOTP = ({
  onClose,
  email,
  mode,
  onSuccess,
  redirectTo,
  firebaseMode = false,
  confirmationResult = null,
  onFirebaseVerified,
  onResendFirebase,
  smsChallengeKey = 0,
  badgeLabel = null,
}) => {
  const otpLength = firebaseMode ? 6 : 4;
  const [otp, setOtp] = useState(() => Array(otpLength).fill(""));
  const [timeLeft, setTimeLeft] = useState(
    firebaseMode ? FIREBASE_OTP_RESEND_COOLDOWN_SEC : 30
  );
  const [mockOtp, setMockOtp] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef([]);
  /** Always confirm with the latest `confirmationResult` after resend (avoids stale closure). */
  const confirmationRef = useRef(confirmationResult);
  const navigate = useNavigate();

  useEffect(() => {
    confirmationRef.current = confirmationResult;
  }, [confirmationResult]);

  const generateAndLogOtp = useCallback(() => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setMockOtp(code);
    console.log(`[AUTH] Mock OTP for ${email || "user"} (${mode}): ${code}`);
  }, [email, mode]);

  useEffect(() => {
    if (firebaseMode) return;
    generateAndLogOtp();
  }, [firebaseMode, generateAndLogOtp]);

  useEffect(() => {
    if (!firebaseMode) return;
    setOtp(Array(otpLength).fill(""));
    setTimeLeft(FIREBASE_OTP_RESEND_COOLDOWN_SEC);
    setInlineError("");
    inputsRef.current[0]?.focus();
  }, [firebaseMode, otpLength, smsChallengeKey]);

  useEffect(() => {
    setOtp((prev) => {
      if (prev.length === otpLength) return prev;
      return Array(otpLength).fill("").map((_, i) => prev[i] || "");
    });
  }, [otpLength]);

  useEffect(() => {
    if (timeLeft === 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleChange = (value, index) => {
    if (!/^[0-9]?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < otpLength - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleVerify = async () => {
    setInlineError("");
    const enteredOtp = otp.join("");

    if (firebaseMode) {
      const cr = confirmationRef.current;
      if (!cr) {
        setInlineError("Verification not ready. Go back and send the code again.");
        return;
      }
      if (enteredOtp.length !== 6) {
        setInlineError("Please enter the 6-digit code from SMS.");
        return;
      }
      setVerifying(true);
      try {
        await cr.confirm(enteredOtp);
        await onFirebaseVerified?.();
        if (onSuccess) {
          onSuccess();
        } else {
          navigate(redirectTo || "/");
        }
        onClose?.();
      } catch (err) {
        authDiag("error", "otp_confirm_failed", { code: String(err?.code || "") });
        setInlineError(mapFirebaseAuthError(err));
      } finally {
        setVerifying(false);
      }
      return;
    }

    if (enteredOtp.length !== 4) {
      setInlineError("Please enter the 4-digit OTP.");
      return;
    }

    if (enteredOtp !== mockOtp) {
      setInlineError("Invalid OTP. Check the console for the mock code.");
      return;
    }

    if (onSuccess) {
      onSuccess();
    } else {
      if (mode === "reset") {
        navigate("/set-new-password");
      } else {
        navigate(redirectTo || "/");
      }
    }

    onClose?.();
  };

  const resendOtp = async () => {
    setInlineError("");
    if (firebaseMode) {
      if (timeLeft > 0) return;
      if (!onResendFirebase) return;
      setResending(true);
      try {
        await onResendFirebase();
        setOtp(Array(otpLength).fill(""));
        setTimeLeft(FIREBASE_OTP_RESEND_COOLDOWN_SEC);
        inputsRef.current[0]?.focus();
      } catch (err) {
        authDiag("error", "otp_resend_failed", { code: String(err?.code || "") });
        setInlineError(mapFirebaseAuthError(err));
      } finally {
        setResending(false);
      }
      return;
    }

    setOtp(Array(otpLength).fill(""));
    setTimeLeft(30);
    generateAndLogOtp();
    inputsRef.current[0]?.focus();
  };

  const timerClassName = [
    "otpVerifyTimer",
    timeLeft > 0 && timeLeft <= 10 ? "otpVerifyTimer--urgent" : "",
    timeLeft === 0 ? "otpVerifyTimer--ready" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="otpVerifyOverlay">
      <div className="otpVerifyModal" role="dialog" aria-labelledby="otp-verify-title">
        <div className="otpVerifyAccent" aria-hidden />
        {badgeLabel ? <div className="otpVerifyBadge">{badgeLabel}</div> : null}
        <h2 id="otp-verify-title" className="otpVerifyTitle">
          Verify your code
        </h2>

        <p className="otpVerifySubtitle">
          {firebaseMode
            ? "Enter the 6-digit code we sent to your phone via SMS."
            : "Enter the 4-digit code (mock — check the browser console)."}
        </p>

        {firebaseMode && showSmsDeliveryHelp ? (
          <p className="otpVerifySmsHint" role="note">
            SMS can be delayed by carriers. If nothing arrives after a few minutes, use{" "}
            <strong>Resend code</strong> after the timer. In some regions delivery may fail — ensure this
            site&apos;s domain is listed under Firebase Console → Authentication → Settings → Authorized
            domains, and Phone sign-in is enabled.
          </p>
        ) : null}

        <div className="otpVerifyInputs">
          {otp.map((digit, index) => (
            <input
              key={index}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={digit}
              ref={(el) => (inputsRef.current[index] = el)}
              onChange={(e) => handleChange(e.target.value, index)}
              className="otpVerifyInputBox"
              aria-label={`Digit ${index + 1} of ${otpLength}`}
            />
          ))}
        </div>

        <div className={timerClassName}>
          {timeLeft > 0 ? (
            <>
              <span className="otpVerifyTimerLabel">Code expires in</span>
              <span className="otpVerifyTimerValue">
                00:{timeLeft < 10 ? "0" : ""}
                {timeLeft}
              </span>
            </>
          ) : (
            <span className="otpVerifyTimerReady">You can request a new code</span>
          )}
        </div>

        {inlineError ? (
          <p className="otpVerifyError" role="alert">
            {inlineError}
          </p>
        ) : null}

        <button
          type="button"
          className="otpVerifyButton"
          onClick={() => void handleVerify()}
          disabled={verifying}
        >
          {verifying ? "Verifying…" : "Verify & continue"}
        </button>

        <p className="otpVerifyResendText">
          Didn’t receive the code?
          <span
            className={`otpVerifyResendAction${firebaseMode && timeLeft > 0 ? " otpVerifyResendAction--disabled" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (firebaseMode && timeLeft > 0) return;
              void resendOtp();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (firebaseMode && timeLeft > 0) return;
                void resendOtp();
              }
            }}
          >
            {resending ? " Sending…" : " Resend code"}
          </span>
        </p>
      </div>
    </div>
  );
};

export default VerifyOTP;
