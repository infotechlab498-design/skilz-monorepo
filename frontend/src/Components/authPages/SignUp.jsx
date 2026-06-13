import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { VALIDATION_PATTERNS } from "../../utils/validators";
import {
  firebaseEmailSignUpCreateUserOnly,
  mapFirebaseAuthError,
} from "../../services/firebaseAuth.js";
import { usePhoneVerificationLink } from "../../hooks/usePhoneVerificationLink.js";
import { RECAPTCHA_CONTAINER_ID, RECAPTCHA_VISIBLE_FALLBACK_ID } from "../../constants/phoneAuth.js";
import { pakistanLocalToE164 } from "../../utils/phoneE164.js";
import { auth } from "../../firebase/config.js";
import { createUserProfile } from "../../api/userApi.js";
import {
  signUpWithGoogleRedirect,
  signUpWithFacebookRedirect,
  AuthLinkRequiredError,
  readPendingOAuthNavigation,
  clearPendingOAuthNavigation,
} from "../../services/authService.js";
import { OAUTH_SIGNUP_PROFILE_PATH } from "../../utils/profileCompletion.js";
import { useAuth } from "../../hooks/useAuth.js";
import "./SignUp.css";
import Layout from "../Layout";
import VerifyOTP from "./SignUpOtp";

const SignUp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { firebaseReady, isAuthenticated } = useAuth();
  const isLegacy = import.meta.env.VITE_LEGACY_SIGNUP === "true";
  const [step, setStep] = useState(1);
  const { phoneConfirmation, smsChallengeKey, sendPhoneLink } = usePhoneVerificationLink();

  /* STEP 1 STATE */

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [signupLocation, setSignupLocation] = useState("");

  const [password, setPassword] = useState("");

  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  /* STEP 2 STATE */

  const [phoneOrEmail, setPhoneOrEmail] = useState("");
  const [month, setMonth] = useState("");
  const [date, setDate] = useState("");
  const [year, setYear] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialSignupBusy, setSocialSignupBusy] = useState("");
  const [smsLoading, setSmsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const socialActionsLocked =
    loading || socialSignupBusy !== "" || !acceptedTerms || !captchaChecked;
  /* STEP 1 SUBMIT */

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (!captchaChecked) {
      setError("Please verify that you are not a robot.");
      return;
    }

    if (!acceptedTerms) {
      setError("You must accept the Terms and Privacy Policy.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    // Validations using Centralized Patterns

    if (!VALIDATION_PATTERNS.EMAIL.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!VALIDATION_PATTERNS.PHONE.test(phone)) {
      setError("Enter valid phone (03XXXXXXXXX, 11 digits).");
      return;
    }

    if (!VALIDATION_PATTERNS.CNIC.test(cnic)) {
      setError("CNIC format: 12345-1234567-1");
      return;
    }

    setLoading(true);

    try {
      if (isLegacy) {
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            email,
            phone,
            cnic,
            password,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Signup failed');
        }

        // Legacy path is deprecated; Firebase-native flow should be used in production.

      } else {
        await firebaseEmailSignUpCreateUserOnly({ email, password });
      }

      setStep(2);
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 2 && !isLegacy && email) {
      setPhoneOrEmail((v) => (v.trim() === "" ? email : v));
    }
  }, [step, isLegacy, email]);

  useEffect(() => {
    const notice = location.state?.authNotice;
    if (typeof notice === "string" && notice.trim()) {
      setError(notice.trim());
    }
  }, [location.state]);

  /** After Google/Facebook redirect or completed session, leave sign-up once Redux is hydrated. */
  useEffect(() => {
    if (!firebaseReady || !isAuthenticated) return;
    const pending = readPendingOAuthNavigation();
    if (pending) {
      clearPendingOAuthNavigation();
      navigate(pending, { replace: true });
    }
  }, [firebaseReady, isAuthenticated, navigate]);

  const handleSignUpGoogle = async () => {
    if (!acceptedTerms || !captchaChecked) {
      setError("Please accept the terms and confirm you're not a robot.");
      return;
    }
    setError("");
    setSocialSignupBusy("google");
    try {
      const r = await signUpWithGoogleRedirect(OAUTH_SIGNUP_PROFILE_PATH);
      if (r?.status === "ok" && r.navigateTo) {
        navigate(r.navigateTo, { replace: true });
      }
    } catch (err) {
      if (err instanceof AuthLinkRequiredError) {
        setError(err.userMessage);
      } else {
        setError(mapFirebaseAuthError(err));
      }
    } finally {
      setSocialSignupBusy("");
    }
  };

  const handleSignUpFacebook = async () => {
    if (!acceptedTerms || !captchaChecked) {
      setError("Please accept the terms and confirm you're not a robot.");
      return;
    }
    setError("");
    setSocialSignupBusy("facebook");
    try {
      const r = await signUpWithFacebookRedirect(OAUTH_SIGNUP_PROFILE_PATH);
      if (r?.status === "ok" && r.navigateTo) {
        navigate(r.navigateTo, { replace: true });
      }
    } catch (err) {
      if (err instanceof AuthLinkRequiredError) {
        setError(err.userMessage);
      } else {
        setError(mapFirebaseAuthError(err));
      }
    } finally {
      setSocialSignupBusy("");
    }
  };

  const handleResendSms = async () => {
    const u = auth.currentUser;
    if (!u) {
      throw new Error("Session expired. Please start sign-up again.");
    }
    const e164 = pakistanLocalToE164(phone);
    if (!e164) {
      throw new Error("Invalid phone format.");
    }
    await sendPhoneLink(u, e164, RECAPTCHA_CONTAINER_ID);
  };

  /* STEP 2 SUBMIT */

  const handleVerifyNext = async (e) => {
    e.preventDefault();
    setError("");

    if (!phoneOrEmail || !month || !date || !year) {
      setError("Please fill all verification fields.");
      return;
    }

    if (!isLegacy) {
      const pe = phoneOrEmail.trim().toLowerCase();
      const em = email.trim().toLowerCase();
      if (pe !== em) {
        setError("Confirm your email: the field must match the email from step 1.");
        return;
      }
      setSmsLoading(true);
      try {
        const u = auth.currentUser;
        if (!u) {
          throw new Error("Session expired. Return to step 1 and try again.");
        }
        const e164 = pakistanLocalToE164(phone);
        if (!e164) {
          setError("Invalid phone number.");
          return;
        }
        await sendPhoneLink(u, e164, RECAPTCHA_CONTAINER_ID);
        setStep(3);
      } catch (err) {
        console.error("[SignUp] phone link failed", err?.code || "", err?.message || err);
        setError(mapFirebaseAuthError(err));
      } finally {
        setSmsLoading(false);
      }
      return;
    }

    setStep(3);
  };

  return (
    <Layout>
      <div className="sign-up-container">
        <div className="sign-up-wrapper">

          {/* TOP HEADING - Visible only in Step 1 & 2 */}

          {step < 3 && (
            <div className="sign-up-top">
              <div className="headline-and-subhead">
                <h2 className="signUp-heading-text">Register To Play</h2>
                <p className="signUp-text">
                  Build your gaming identity with Prime Gaming.
                  Join the community and unlock premium features.
                </p>
              </div>
            </div>
          )}

          {/* STEP 1 */}

          {step === 1 && (
            <div className="create-an-account">
              <form className="content" onSubmit={handleSignup}>
                <div className="sign-up-header">
                  <h3>Create an account</h3>
                  <span>Step 1 of 3</span>

                </div>

                <input
                  type="text"
                  placeholder="User name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />

                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <input
                  type="tel"
                  placeholder="Phone number (03XXXXXXXXX)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required

                />

                <input
                  type="text"
                  placeholder="CNIC (12345-1234567-1)"
                  value={cnic}
                  onChange={(e) => setCnic(e.target.value)}
                  required
                />

                <input
                  type="text"
                  placeholder="City / location (optional)"
                  value={signupLocation}
                  onChange={(e) => setSignupLocation(e.target.value)}
                />

                <div className="password-field">
                  <div className="password-group">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <small>Use 8+ characters with letters & numbers</small>
                </div>

                <label className="terms">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  <span>
                    I agree to the <a href="/terms">Terms</a> &{" "}
                    <a href="/privacy">Privacy Policy</a>
                  </span>
                </label>

                <label className="captcha">
                  <input
                    type="checkbox"
                    checked={captchaChecked}
                    onChange={(e) => setCaptchaChecked(e.target.checked)}
                  />
                  I'm not a robot
                </label>

                {error && <p className="error">{error}</p>}

                <button type="submit" disabled={loading || socialSignupBusy !== ""} className="signup-btn">
                  {loading ? "Creating..." : "Next"}
                </button>

                {!isLegacy && (
                  <div className="sign-up-social-block">
                    <p className="sign-up-social-hint">
                      Or register with Google / Facebook — no SMS OTP. You&apos;ll finish phone &amp; CNIC on your Player Profile.
                    </p>
                    <button
                      type="button"
                      className="signup-btn signup-btn--google"
                      disabled={socialActionsLocked}
                      onClick={handleSignUpGoogle}
                    >
                      {socialSignupBusy === "google" ? "…" : "Continue with Google"}
                    </button>
                    <button
                      type="button"
                      className="signup-btn signup-btn--facebook"
                      disabled={socialActionsLocked}
                      onClick={handleSignUpFacebook}
                    >
                      {socialSignupBusy === "facebook" ? "…" : "Continue with Facebook"}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {/*  STEP 2  */}

          {step === 2 && (
            <div className="create-an-account">
              <form className="content" onSubmit={handleVerifyNext}>
                <div className="sign-up-header">
                  <h2>Sign up</h2>
                  <span>Step 2 of 3</span>
                </div>

                <div className="form-feilds">
                  <input
                    className="text-field-instance"
                    type="text"
                    placeholder="Your username"
                    value={username}
                    disabled
                  />

                  <div className="form-feilds-email">
                    <input
                      className="text-field-instance"
                      type="text"
                      placeholder="Phone or Email"
                      value={phoneOrEmail}
                      onChange={(e) => setPhoneOrEmail(e.target.value)}
                      required
                    />
                    <div className="text-wrapper-4">Use Email instead</div>
                  </div>

                  <div className="form-feilds-dob">

                    <p className="p">What&apos;s your date of birth?</p>

                    <div className="dob-group">
                      <input
                        className="text-field-2"
                        placeholder="Month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                      />
                      <input
                        className="text-field-3"
                        placeholder="Date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                      <input
                        className="text-field-3"
                        placeholder="Year"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {error && <p className="error">{error}</p>}

                <button
                  className="signup-btn"
                  type="submit"
                  disabled={!isLegacy && smsLoading}
                >
                  {!isLegacy && smsLoading ? "Sending SMS…" : "Next"}
                </button>
              </form>
            </div>
          )}

          {/* STEP 3 */}

          {step === 3 && (isLegacy || phoneConfirmation) && (
            <VerifyOTP
              email={email || phone}
              mode="signup"
              badgeLabel="Step 3 of 3"
              firebaseMode={!isLegacy}
              confirmationResult={phoneConfirmation}
              smsChallengeKey={smsChallengeKey}
              onResendFirebase={!isLegacy ? handleResendSms : undefined}
              onFirebaseVerified={
                !isLegacy
                  ? async () => {
                      const u = auth.currentUser;
                      if (!u) throw new Error("Session expired. Please sign up again.");
                      const e164 = pakistanLocalToE164(phone);
                      if (!e164) throw new Error("Invalid phone number.");
                      await createUserProfile({
                        uid: u.uid,
                        email,
                        username,
                        fullName: username.trim(),
                        phoneLocal: phone.trim(),
                        phoneE164: e164,
                        cnic,
                        location: signupLocation.trim(),
                        dob: { year, month, day: date },
                        photoURL: "",
                      });
                      await fetch('/api/debug/log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ event: 'signup_complete', uid: u.uid, email, username }),
                      }).catch(() => {});
                    }
                  : undefined
              }
              onSuccess={() => {
                alert("Account created successfully!");
                navigate("/");
              }}
            />
          )}


        </div>
        <div
          id={RECAPTCHA_CONTAINER_ID}
          className="sign-up-recaptcha-host"
          aria-hidden="true"
        />
        <div
          id={RECAPTCHA_VISIBLE_FALLBACK_ID}
          className="sign-up-recaptcha-fallback"
          role="region"
          aria-label="Security verification (shown if invisible check fails)"
        />
      </div>

    </Layout>
  );
};

export default SignUp;
