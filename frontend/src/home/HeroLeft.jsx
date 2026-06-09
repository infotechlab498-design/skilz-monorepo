import React from "react";
import "./HeroSlider.css";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-container">

        {/* LEFT CONTENT */}

        <div className="hero-left">
          
          <h5 className="hero-tag">Competition</h5>

          <h1 className="hero-title">
            <span className="gradient-blue">UNREAL WORLDS</span>
            <br />
            <span className="gradient-purple">EPIC REALITY</span>
          </h1>

          <span className="hero-description">
            Experience breathtaking visuals and immersive gameplay designed to
            push your hardware to the edge. This isn't just a game; it's the
            future of play.
          </span>

          <button className="hero-btn">Explore The World</button>
        </div>      

      </div>
    </section>
  );
}
