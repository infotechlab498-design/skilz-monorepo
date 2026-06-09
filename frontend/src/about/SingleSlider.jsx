import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";

// Swiper styles
import "swiper/css";

import "./styles/blogSlider.css";

// Assets

import hero1 from "../assets/singleSlider.png";
import hero2 from "../assets/heroS1.png";
import hero3 from "../assets/heroS2.png";
import hero4 from "../assets/heroS3.png";
import hero5 from "../assets/heroS4.png";

const slides = [
  {
    id: 1,
    image: hero1,
    title: "FC25 Prepares for October 2024 Release with Enhanced Realism",
  },
  {
    id: 2,
    image: hero2,
    title: "Top 10 Competitive Games You Should Try This Month",
  },
  {
    id: 3,
    image: hero3,
    title: "Esports Teams Reveal Their Strategy for Upcoming Finals",
  },
  {
    id: 4,
    image: hero4,
    title: "How Next-Gen Graphics Are Changing Online Multiplayer",
  },
  {
    id: 5,
    image: hero5,
    title: "Game Storytelling Is Entering a New Cinematic Era",
  },
];

const HeroRight = () => {
  return (
    <div className="abt-featureWrap">

      <Swiper
        spaceBetween={16}
        loop={true}
        autoplay={{
          delay: 3500,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        modules={[Autoplay]}
        className="abt-featureSwiper"
      >

        {slides.map((slide) => (
          <SwiperSlide key={slide.id}>
            <article className="abt-featureCard">
              <img src={slide.image} alt={slide.title} className="abt-featureImg" />
              <div className="abt-featureOv">
                <p className="abt-featureT">{slide.title}</p>
              </div>
            </article>
          </SwiperSlide>
        ))}
      </Swiper>

    </div>
  );
};

export default HeroRight;