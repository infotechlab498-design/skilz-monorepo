import React from 'react';
import Layout from '../Components/Layout';
import HeroRight from './HeroRight';
import HeroLeft from './HeroLeft';
import "./headerHero.css"
import HowItWorks from './HowItWorks';
import OurGames from './OurGames';
// import OurRecentWinners from './OurRecentWinners';
import NewsletterSection from './NewsletterSection';
import PricingPlans from './PricingPlans';

const Home = () => {
  return (

        <Layout>
          <div className="headerHero">

      <HeroLeft/>
      <HeroRight/>
   
    </div>
    <OurGames/>
      <HowItWorks/>
      {/* <OurRecentWinners/>        hide for now ,will add later for winners in the future  */}
      <PricingPlans/>
      <NewsletterSection/>

        </Layout>
  )
}

export default Home;
