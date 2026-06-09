import React from "react";
import "./NewsletterSection.css";
import NewsletterSubscribe from "./NewsletterSubscribe";

const NewsletterSection = () => {

  return (
    <section className="newsletter-section">
      <div className="newsletter-container">
        {/* Header */}

        <div className="newsletter-header">
          <h2 className="title-text">Stay Connected with the Game</h2>
          <p className="description-text">
            
            Discover the latest gaming strategies, updates, and exclusive
            insights crafted for competitive players. Our blog brings you
            expert tips, game news, and behind-the-scenes content to help
            you stay ahead of the competition.
          </p>
        </div>

        {/* Card */}
        <div className="subscription-card">
          <div className="card-text">

            <h3 className="card-headline">Don't Miss a Power-Up</h3>
            <p className="card-subtext">
              Subscribe to get the latest game updates, tips, and exclusive offers.
            </p>
          </div>

          <div className="card-form">
            <NewsletterSubscribe />
          </div>
        </div>
      </div>
    </section>
  );
};

export default NewsletterSection;
