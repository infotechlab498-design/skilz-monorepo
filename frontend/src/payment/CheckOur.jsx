import React from 'react'
import icon2 from "./icon-2.svg";
import icon from "./icon.svg";
import image from "./image.svg";
import "./checkout.css";

const Checkout = () => {
  return (
    <div>
      CheckOut
    </div>
  )
}

export default Checkout;

export const Container = () => {
  return (
    <div className="container">
      <div className="basic-card">
        <div className="icon-wrapper">
          <img className="icon" alt="Icon" src={icon} />
        </div>

        <div className="heading">
          <div className="text">500 Coins</div>
        </div>

        <div className="text-wrapper">
          <p className="div">
            Entry level boost for
            <br />
            casual voyagers.
          </p>
        </div>

        <div className="div-wrapper">
          <div className="text-2">Rs 500</div>
        </div>
      </div>

      <div className="best-value-card">
        <div className="icon-wrapper">
          <img className="img" alt="Icon" src={image} />
        </div>

        <div className="heading">
          <div className="text-3">1000 Coins</div>
        </div>

        <div className="text-wrapper">
          <p className="p">
            The standard choice for
            <br />
            active explorers.
          </p>
        </div>

        <div className="div-wrapper">
          <div className="text-4">Rs 1,000</div>
        </div>

        <div className="background">
          <div className="text-5">BEST VALUE</div>
        </div>
      </div>

      <div className="mega-card">
        <div className="icon-wrapper">
          <img className="icon-2" alt="Icon" src={icon2} />
        </div>

        <div className="heading">
          <div className="text-6">5000 Coins</div>
        </div>

        <div className="text-wrapper">
          <div className="text-7">
            Elite package for
            <br />
            legendary status.
          </div>
        </div>

        <div className="div-wrapper">
          <div className="text-8">Rs 4,500</div>
        </div>
      </div>
    </div>
  );
};

export const PaymentFormSection = () => {
  return (
    <div className="payment-form-section">
      <div className="div">
        <div className="heading">
          <div className="container">
            <img className="icon" alt="Icon" src={image} />
          </div>

          <div className="text">Payment Method</div>
        </div>

        <div className="container-2">
          <div className="background-border">
            <div className="background">
              <div className="text-wrapper">EP</div>
            </div>

            <div className="container">
              <div className="text-2">Easypaisa</div>
            </div>
          </div>

          <div className="background-border-2">
            <div className="div-wrapper">
              <div className="text-3">JC</div>
            </div>

            <div className="container">
              <div className="text-4">JazzCash</div>
            </div>
          </div>

          <div className="background-border-3">
            <div className="container-wrapper">
              <div className="container">
                <img className="img" alt="Icon" src={icon2} />
              </div>
            </div>

            <div className="container">
              <div className="text-5">Bank Transfer</div>
            </div>
          </div>
        </div>
      </div>

      <div className="div">
        <div className="heading">
          <div className="container">
            <img className="icon-2" alt="Icon" src={icon} />
          </div>

          <div className="text-6">User Information</div>
        </div>

        <div className="localized-fields">
          <div className="container-3">
            <div className="account-name">ACCOUNT NAME</div>

            <div className="input">
              <div className="container-4">
                <div className="text-wrapper-2">John Doe</div>
              </div>
            </div>
          </div>

          <div className="container-5">
            <div className="label-transaction-ID">TRANSACTION ID</div>

            <div className="input">
              <div className="container-4">
                <div className="text-wrapper-2">TID-XXXXXXXX</div>
              </div>
            </div>
          </div>
        </div>

        <div className="container-6">
          <div className="container-3">
            <div className="card-number">CARD NUMBER</div>

            <div className="input">
              <div className="container-4">
                <div className="text-wrapper-2">03XXXXXXXXX</div>
              </div>
            </div>
          </div>

          <div className="container-5">
            <div className="expiry-date">EXPIRY DATE</div>

            <div className="input">
              <div className="container-4">
                <div className="text-wrapper-2">14/05/2026</div>
              </div>
            </div>
          </div>

          <div className="container-7">
            <div className="text-wrapper-3">CSV</div>

            <div className="input">
              <div className="container-4">
                <div className="text-wrapper-2">923</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};







export const RightColumnOrder = () => {
  return (
    <div className="right-column-order">
      <div className="container">
        <div className="background-border">
          <div className="heading">
            <div className="text">Order Summary</div>
          </div>

          <div className="div">
            <div className="container-2">
              <div className="container-3">
                <div className="text-wrapper">Selected Item</div>
              </div>

              <div className="container-3">
                <div className="text-2">1000 Coins Package</div>
              </div>
            </div>

            <div className="container-2">
              <div className="container-3">
                <div className="text-3">Subtotal</div>
              </div>

              <div className="container-3">
                <div className="text-4">Rs 1,000</div>
              </div>
            </div>

            <div className="container-2">
              <div className="container-3">
                <div className="text-5">Tax (0%)</div>
              </div>

              <div className="container-3">
                <div className="text-6">Rs 0</div>
              </div>
            </div>

            <div className="horizontal-border">
              <div className="container-3">
                <div className="text-7">Grand Total</div>
              </div>

              <div className="container-3">
                <div className="text-8">Rs 1,000</div>
              </div>
            </div>
          </div>

          <button className="button">
            <div className="text-9">Pay Now</div>
          </button>

          <div className="container-4">
            <div className="container-5">
              <div className="container-3">
                <img className="icon" alt="Icon" src={icon} />
              </div>

              <div className="container-3">
                <div className="text-10">SSL SECURE</div>
              </div>
            </div>

            <div className="background" />

            <div className="container-6">
              <div className="container-3">
                <img className="img" alt="Icon" src={image} />
              </div>

              <div className="container-3">
                <div className="text-11">VERIFIED MERCHANT</div>
              </div>
            </div>
          </div>
        </div>

        <div className="overlay-border">
          <div className="icon-wrapper">
            <img className="icon-2" alt="Icon" src={icon2} />
          </div>

          <div className="div-wrapper">
            <p className="p">
              Need help with your purchase? Our support team is available
              <br />
              24/7 to assist with payment issues or coin delivery delays.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
