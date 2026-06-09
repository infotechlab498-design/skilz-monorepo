// import React from 'react'

// const Paymentform = () => {
//   return (
//     <div>
//       Paymentform
//     </div>
//   )
// }

// export default Paymentform


// import "../styles/paymentForm.css";




import { useState } from "react";
import "./PaymentCard.css";

const PaymentForm = () => {
  const [formData, setFormData] = useState({
    cardName: "",
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (
      !formData.cardName ||
      !formData.cardNumber ||
      !formData.expiryMonth ||
      !formData.expiryYear ||
      !formData.cvv
    ) {
      alert("Please fill all card details");
      return;
    }

    if (formData.cardNumber.length < 16) {
      alert("Invalid card number");
      return;
    }

    alert("Payment processed successfully 💳");
  };

  return (
    <div className="payment-container">
      <div className="payment-card">
        {/* header */}
        <h2 className="payment-title">Credit Card Details</h2>

        {/* payment methods */}

        <div className="payment-methods">
          <span>Payment Method</span>
          <div className="logos">
            <img src="/assets/visa.svg" alt="Visa" />
            <img src="/assets/mastercard.svg" alt="Mastercard" />
            <img src="/assets/easypaisa.png" alt="Easypaisa" />
          </div>
        </div>

        {/*form */}
        <form onSubmit={handleSubmit} className="payment-form">
          <div className="form-group">
            <label>Name on Card</label>
            <input
              type="text"
              name="cardName"
              placeholder="John Doe"
              value={formData.cardName}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Card Number</label>
            <input
              type="text"
              name="cardNumber"
              maxLength="16"
              placeholder="1234 5678 9012 3456"
              value={formData.cardNumber}
              onChange={handleChange}
            />
          </div>

          <div className="row">
            <div className="form-group">
              <label>Expiry Month</label>
              <select
                name="expiryMonth"
                value={formData.expiryMonth}
                onChange={handleChange}
              >
                <option value="">MM</option>
                {[...Array(12)].map((_, i) => (
                  <option key={i} value={i + 1}>
                    {String(i + 1).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Expiry Year</label>
              <select
                name="expiryYear"
                value={formData.expiryYear}
                onChange={handleChange}
              >
                <option value="">YY</option>
                {[...Array(10)].map((_, i) => (
                  <option key={i} value={2024 + i}>
                    {2024 + i}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>CVV</label>
              <input
                type="password"
                name="cvv"
                maxLength="3"
                placeholder="***"
                value={formData.cvv}
                onChange={handleChange}
              />
            </div>
          </div>

          <button type="submit" className="pay-btn">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
};

export default PaymentForm;
