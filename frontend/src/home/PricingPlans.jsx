import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { api } from "../services/api";
import {
  navigateToCheckoutOrGate,
  useMergedPlayerProfile,
} from "../hooks/useBillingAccess.js";
import "./PricingPlans.css";

const PricingPlans = () => {
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const mergedProfile = useMergedPlayerProfile();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const data = await api.getPlans();
        setPlans(data);
      } catch (error) {
        console.error("Failed to fetch plans:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSelectPlan = (plan) => {
    localStorage.setItem("selectedPlan", JSON.stringify(plan));
    navigateToCheckoutOrGate(navigate, isAuthenticated, mergedProfile);
  };

  if (loading) {
    return <section className="pricing-section">Loading plans...</section>;
  }

  return (
    <section className="pricing-section">
      <h2 className="pricing-title">Pricing plans</h2>
      <p className="pricing-subtitle">Unlock More Games</p>

      <p className="pricing-note">
        For more details on all our pricing visit{" "}
        <a href="#">here</a>
      </p>

      <div className="pricing-grid">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`pricing-card ${
              plan.highlighted ? "active" : ""
            }`}
          >
            <h3>{plan.title}</h3>

            <div className="price">
              {Number(plan.price).toFixed(2)}
              <span>pkr</span>
            </div>

            <p className="card-desc">{plan.description}</p>

            <ul className="features">
              {plan.features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>

            <button
              className="cta-btn"
              onClick={() => handleSelectPlan(plan)}
            >
              Get started today
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PricingPlans;
