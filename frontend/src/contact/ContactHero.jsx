
import React from "react";
import { Link, useLocation } from "react-router-dom";
import globeImage from "../assets/HugeGlobal.png";
// import "./ContactHero.css";
import "./styles/contactUs.css";

const ContactHero = () => {
  const location = useLocation();

  const pathSegments = location.pathname
    .split("/")
    .filter(Boolean);

  return (
    <div>

    <section className="contact-hero">
      <div className="contact-hero-content">

        {/* Breadcrumb */}
        
        <nav className="breadcrumb">


          <Link to="/">Home</Link>
          {pathSegments.map((segment, index) => (
              <span key={index}>
              {" > "}
              <span className="breadcrumb-active">
                {segment.replace("-", " ")}
              </span>
            </span>
          ))}
        </nav>

        {/* Title */}
        <h1 className="contact-titl">
       <span className="contact-title"> Connect with Our Gaming Team
        </span> 
        </h1>

        {/* Description */}
        <p className="contact-description">
          Questions, feedback, or support? Our team is ready to help you anytime.
        </p>
      </div>

      {/* Image */}
      
      <div className="contact-hero-image">
        <img src={globeImage} alt="Global network" className="image-1" />
      </div>
    </section>

    <section className="contact-menual">
      {/* LEFT */}
      <div className="contact-left">
        <h5>Follow Us</h5>
        <div className="social-icons">
          <span>f</span>
          <span>◯</span>
          <span>🐦</span>
          <span>in</span>
        </div>
      </div>

      {/* CENTER */}
      <div className="contact-center">
        <span className="phone-icon">📞</span>
        <p>+923028576530</p>
      </div>

      {/* RIGHT */}
      <div className="contact-right">
        <span className="location-icon">📍</span>
        <p>but also the leap into electronic typesetting</p>
      </div>
    </section>
  </div>
  );
};

export default ContactHero;
