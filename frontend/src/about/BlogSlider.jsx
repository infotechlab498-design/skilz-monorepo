
import "./styles/blogSlider.css";

import hero1 from "../assets/hero1.png";
import hero2 from "../assets/hero2.png";
import hero3 from "../assets/hero3.png";
import hero4 from "../assets/hero4.png";

const cards = [
  {
    id: 1,
    title: "FC25 Prepares for October 2024 Release with Enhanced Realism",
    image: hero1,
  },
  {
    id: 2,
    title: "The Witcher 4 Expected to Bring Back Fan-Favorite Characters",
    image: hero2,
  },
  {
    id: 3,
    title: "Marvel's Wolverine Set for an Epic 2025 Launch on PS5",
    image: hero3,
  },
  {
    id: 4,
    title: "Star Wars Outlaws Combines Open-World Action and Storytelling",
    image: hero4,
  },
];

export default function HeroLeft() {
  return (
    <div className="abt-grid4" aria-label="Blog highlights">
      {cards.map((item) => (
        <article key={item.id} className="abt-miniCard">
          <img src={item.image} alt={item.title} className="abt-miniImg" />
          <div className="abt-miniOv">
            <p className="abt-miniT">{item.title}</p>
          </div>
        </article>
      ))}
    </div>
  );
}