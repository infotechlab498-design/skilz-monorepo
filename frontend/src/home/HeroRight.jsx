

import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";

// Swiper styles

import "swiper/css";

import "./HeroSlider.css";

// Assets

import heroS1 from "../assets/heroS1.png";

const slides = [
  {
    id: 1,
    image: heroS1,
  },
  {
    id: 2,
    image: heroS1,   
  },
  {
    id: 3,
    image: heroS1,    
  },
  {
    id: 4,
    image: heroS1,    
  },
  {
    id: 5,
    image: heroS1,    
  },
];

const HeroRight = () => {
  return (
    <div className="Righ-swiper-slid">

    <Swiper
      spaceBetween={24}
      loop={true}
      autoplay={{
        delay: 3000,
        disableOnInteraction: false,
        pauseOnMouseEnter: true,
      }}
      modules={[Autoplay]}
      className="Right-mySwiper"
      >
      {slides.map((slide) => (
        <SwiperSlide key={slide.id}>
          <div
            className="Righthero-slide-box"
            style={{ backgroundImage: `url(${slide.image})` }}
            >
            <div className="Righthero-slide-overlay">
              
            </div>
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
      </div>
  );
};

export default HeroRight;
