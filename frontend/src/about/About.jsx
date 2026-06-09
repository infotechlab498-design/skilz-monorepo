// import React from 'react';
import AboutUsIntro from './AboutUsInto';
import Layout from '../Components/Layout';
import "./styles/headerAbout.css";
import { useLocation, Link } from 'react-router-dom';
// import AboutSignIn from "./AboutSignIn";
// import GamingExperienceLeft from './GamingExperienceLeft';

import Faqs from './Faqs';
import HeroLeft from './BlogSlider';
import HeroRight from './SingleSlider';
import GamingExperienceLeft from './GamingExperienceLeft';
import AboutSignIn from './AboutSignIn';


const About = () => {

  // const navigate = useNavigate();

  return (
    <div>
      <Layout>

        <AboutHeader />

        <AboutUsIntro />

        <div className='about-gaming-experience'>

          <GamingExperienceLeft />
          <AboutSignIn />
        </div>

        <div className='blog-slider-header'>
          <h2>Blog Post</h2>
          <Link to="/blogs">View All &gt;</Link>

        </div>

        <div className='blog-slider'>
          <HeroLeft />
          <HeroRight />
        </div>
        <Faqs />


      </Layout>
    </div>

  )
}

export default About;


export const AboutHeader = () => {

  const location = useLocation();

  const pathSegments = location.pathname
    .split("/")
    .filter(Boolean);


  return (
    <div>

      {/* <div className="about-head">
        <h2 className="text-wrapper">Frequently Asked Questions</h2>
      </div> */}

      <div className="about-hero-conte">

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
        <div className="about-hero-content">
          {/* Title */}
          <h1 className="about-title">
            Join the Skilz Community
          </h1>

          {/* Description */}
          <p className="about-description">
            Questions, feedback, or support? Our team is ready to help you anytime.
          </p>

        </div>

      </div>
    </div>
  )
}


