import "./styles/aboutus.css";

function GamingExperienceLeft() {
  return (
    <div className="gaming-left">
      <h2 className="gaming-title">
        Unlock The Ultimate <span>Gaming Experience</span>
      </h2>

      <p className="gaming-description">
        Sign up now to dive into exclusive content, track your progress, and
        connect with a global community of gamers. Don’t miss out on offers made
        just for you!
      </p>

      <div className="features-grid">
        <div className="feature-card">
          <h4>     
            <span>Access</span> Exclusive Games
          </h4>
          <p>
            Get early access to new releases and hidden gems available only to
            registered members.
          </p>
        </div>

        <div className="feature-card">
          <h4>
            <span>Track</span> Stats & <span>Achievements</span>
          </h4>
          <p>
            Monitor gameplay stats, track achievements, and share your progress
            with fellow gamers.
          </p>
        </div>

        <div className="feature-card">
          <h4>
            <span>Join Our</span> Community
          </h4>
          <p>
            Connect with passionate gamers, share tips, strategies, and gaming
            experiences.
          </p>
        </div>

        <div className="feature-card">
          <h4>
            <span>Exclusive</span> Discounts & <span>Offers</span>
          </h4>
          <p>
            Enjoy member-only discounts on games, DLCs, and in-game items.
          </p>
        </div>
      </div>
    </div>
  );
};
export default GamingExperienceLeft;