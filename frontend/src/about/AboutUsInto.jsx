import image67 from "../assets/aboutSkilz.png";
import AboutSignIn from "./AboutSignIn";
import GamingExperienceLeft from "./GamingExperienceLeft";


import "./styles/aboutus.css";

function AboutUsIntro() {
  return (
    <div>

      <div className="section">




        <div className="about-Left-group">


          <h3 className="text-wrapper">
            About Us
          </h3>

          <p className="cras-gravida-tortor">
          Skilz is a next-generation competitive gaming platform built for players who want real challenges, real rewards, and real recognition. Authorized and certified to operate professionally, Skilz brings together skill-based games where every match is an opportunity to grow, compete, and win.<br/> Our platform is designed to deliver an exciting real-world gaming experience with secure gameplay, rankings, XP systems, winning streaks, and performance-based rewards. Players can participate in competitive matches through our platform, earn achievements, unlock higher ranks, and prove their skills against top competitors. At Skilz, gaming is more than entertainment


            <br />
            It is a journey of competition, strategy, and achievement. We are creating a trusted ecosystem where passionate gamers can play, compete, and rise to the top in a professional gaming environment.
           
          </p>

        </div>


        <div className="image-decoration-container">
          <div className="rectangle" />
          <div className="rectangle secondar" />
          <img className="about-Intro-image" alt="About us visual" src={image67} />
        </div>

      </div>
    </div>
  );
};
export default AboutUsIntro;