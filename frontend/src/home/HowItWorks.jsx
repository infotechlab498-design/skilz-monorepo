

import React, { useState } from "react";
import "./HowItWorks.css";

import jumpIntoAction from "../assets/jumpIntoAction.png";
import playEarn from "../assets/PlayEarn.png";
import thirdIcon from "../assets/thirdIcon.png";




const staticStepsData = [
  {
    id: 1,
    title: "Create Account",
    description:
      "Enter your information ensure your details safe and more secure",
    icon: jumpIntoAction,
    red: true,
  },
  {
    id: 2,
    title: "Billing Details",
    description:
      "Sending money faster & easier with end to end encryption.",
    icon: playEarn,
    red: false,
  },
  {
    id: 3,
    title: "Buy Coins",
    description:
      "Add multiple cards and track your daily expense with quality interface",
    icon: thirdIcon,
    red: true,
  },
];

const HowItWorks = () => {
  const [steps] = useState(staticStepsData);



  return (
    <section className="how-it-works">
      <h2>How it works</h2>
      <p className="subtitle">
        Mobile banking differs from mobile payments, which involves the use
        of a mobile device
      </p>

      <div className="steps-container">
        {steps.map((step) => (
          <div className="step" key={step.id}>
            <div className={`icon-box ${step.red ? "red" : ""}`}>
              <img src={step.icon} alt={step.title} />
            </div>
            <h4>{step.title}</h4>
            <p>{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default HowItWorks;
