import "./Footer.css";


 const Footer = () => {
  return (
    <footer className="footer">
      
      <div className="footer-brand">
        <div className="brand-logo">
          
          <div>
            <span className="brand-name-light">Prime</span>
            <span className="brand-name-bold">Gaming</span>
          </div>
        </div>

        <p className="brand-tagline">
          Unleash Your Gaming Potential With Prime Gaming
        </p>

        <p className="brand-description">
          Step Into The Future Of Gaming With Prime Gaming. Explore Top-tier
          Reviews, News, And In-depth Analysis On The Latest And Greatest Games.
        </p>
      </div>

      {/* Footer links */}
      <div className="footer-links">
        <div className="footer-column">
          <h4>Explore</h4>
          <ul>
            <li>Trending Games</li>
            <li>Upcoming Releases</li>
            <li>Reviews</li>
            <li>News</li>
          </ul>
        </div>

        <div className="footer-column">
          <h4>Resources</h4>
          <ul>
            <li>FAQ</li>
            <li>Tutorials</li>
            <li>Community Forum</li>
            <li>Membership</li>
          </ul>
        </div>

        <div className="footer-column">
          <h4>Programs</h4>
          <ul>
            <li>Game of the Month</li>
            <li>Game of the Year</li>
            <li>Developer Spotlight</li>
            <li>Beta Access</li>
          </ul>
        </div>
      </div>

      {/* Contact details */}
      <div className="footer-contact">
        <h4>Contact Us</h4>

        <div className="contact-item">
         
          <span>USA – Washington DC</span>
        </div>

        <div className="contact-item">
          
          <span>1234-56789</span>
        </div>

        <div className="contact-item">
          
          <span>primegaming@gmail.com</span>
        </div>
      </div>
    </footer>
  );
};


export default Footer;