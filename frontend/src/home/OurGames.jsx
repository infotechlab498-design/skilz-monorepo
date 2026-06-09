import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";

import "swiper/css";
import "swiper/css/navigation";

import { Navigation } from "swiper/modules";
import "./OurGames.css";

const games = [
  { id: "ludo", title: "Ludo game", image: "/ludogame.png" },
  { id: "trivia", title: "Trivia", image: "/triviaGame.png" },
  { id: "math", title: "Math Quiz", image: "/mathRush.png" },
  { id: "enigmaPulse", title: "Enigma Pulse", image: "/enigmaPulse.png" },
];

const GameCategories = () => {
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

  React.useEffect(() => {
  }, [navigate]);

  
  // Auth gating is handled by FirebaseAuthSync + Redux `auth.isAuthenticated`.


  const handleGameClick = (gameId) => {
    if (isAuthenticated) {
      // Player is logged in -> Go to lobby


      if (gameId === "ludo") {
        navigate("/ludoLobby");
      } else if (gameId === "trivia") {
        navigate(`/triviaLobby/${gameId}`);
      } else if (gameId === "math") {
        navigate(`/mathRushLobby`);
      } else if (gameId === "enigmaPulse") {
        navigate(`/enigmaPulseLobby`);
      } else if (gameId === "neurochain") {
        navigate(`/neurochainLobby`);
      }

    } else {

      // Player is not logged in -> Alert and redirect to login

      alert("Please login to play!");

      let redirectTo = `/triviaLobby/${gameId}`;
      if (gameId === "ludo") redirectTo = "/ludoLobby";
      else if (gameId === "math") redirectTo = "/mathRushLobby";
      else if (gameId === "neurochain") redirectTo = "/neurochainLobby";

      navigate("/signin", { state: { redirectTo } });
    }
  };

  return (
    <section className="game-section">
      <div className="game-header">
        <h2>Game Categories</h2>

        <div className="game-nav">
          <button className="game-prev">‹</button>
          <button className="game-next">›</button>
        </div>
      </div>

      <Swiper
        slidesPerView={4}
        spaceBetween={24}
        navigation={{
          prevEl: ".game-prev",
          nextEl: ".game-next",
        }}
        breakpoints={{
          0: { slidesPerView: 1.4 },
          640: { slidesPerView: 2.5 },
          768: { slidesPerView: 3 },
          1024: { slidesPerView: 4 },
        }}
        modules={[Navigation]}
        className="game-swiper"
      >
        {games.map((game) => (
          <SwiperSlide key={game.id}>
            <div
              className="game-card"
              onClick={() => handleGameClick(game.id)}
            >
              <div className="card-image">
                <img src={game.image} alt={game.title} height="220px" />
              </div>

              <div className="game-title">
                <h5>{game.title}</h5>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
};

export default GameCategories;