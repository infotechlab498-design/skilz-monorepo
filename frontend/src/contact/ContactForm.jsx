import { useState } from "react";
import "./styles/contactUs.css";
import vector3 from "../assets/DesignLine.png";
import { api } from "../services/api";




const ContactForm = () => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    message: "",
    website: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  /* Validation */
  const validate = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Enter a valid email address";
    }

    if (!formData.message.trim()) {
      newErrors.message = "Message cannot be empty";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /* Handler */

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors(({ _form, ...rest }) => rest);

    if (!validate()) return;

    setLoading(true);
    setSuccess(false);

    try {
      await api.submitContact({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        message: formData.message,
        website: formData.website,
      });

      setSuccess(true);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        message: "",
        website: "",
      });
    } catch (error) {
      console.error("Submission error:", error);
      setErrors((prev) => ({
        ...prev,
        _form: error?.message || "Something went wrong. Please try again.",
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="contact-form-section">
      <div className="contact-form-container">

        <div className="contact-form-header">
          <h2>Need Help? Contact Us</h2>
          <p>Fill out the form and our team will reach you shortly.</p>
        </div>

        {success && (
          <div className="success-message">
            ✅ Your message has been sent successfully!
          </div>
        )}

        {errors._form && (
          <div className="success-message" style={{ background: "#fef3f2", color: "#b42318" }}>
            {errors._form}
          </div>
        )}

        <form className="contact-form" style={{ position: "relative" }} onSubmit={handleSubmit} noValidate>
          {/* Honeypot — leave empty (bots often fill hidden fields). */}
          <div
            className="form-group full-width"
            style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden" }}
            aria-hidden="true"
          >
            <label htmlFor="contact-website">Website</label>
            <input
              type="text"
              id="contact-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={formData.website}
              onChange={handleChange}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="John"
              />
              {errors.firstName && (
                <span className="error">{errors.firstName}</span>
              )}
            </div>

            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Doe"
              />
              {errors.lastName && (
                <span className="error">{errors.lastName}</span>
              )}
            </div>
          </div>

          <div className="form-group full-width">
            <label>Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="john@example.com"
            />
            {errors.email && (
              <span className="error">{errors.email}</span>
            )}
          </div>

          <div className="form-group full-width">
            <label>Message</label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Write your message here..."
            />
            {errors.message && (
              <span className="error">{errors.message}</span>
            )}
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={loading}
          >
            {loading ? "Sending..." : "Get in Touch"}
          </button>
        </form>
      </div>

      <img className="contact-vector" src={vector3} alt="Decoration" />
    </section>
  );
};

export default ContactForm;
