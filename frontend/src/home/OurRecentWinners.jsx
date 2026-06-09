
import React, { useState, useEffect } from 'react';
import './OurRecentWinners.css';

function OurRecentWinners() {
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mockData = [
      { id: 1,
         image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800',
         title: 'Elite Series 2024' 
        },
      { id: 2, 
        image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=800', 
        title: 'Pro League Finals'
     },
      { id: 3, 
        image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&q=80&w=800', 
        title: 'Hardware Masters' 
    },
      { id: 4, 
        image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800', 
        title: 'Tech Showcase' 
    },
      { id: 5, 
        image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&q=80&w=800', 
        title: 'Arcade Classic' 
    },
      { id: 6, 
        image: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&q=80&w=800', 
        title: 'Neon Nights' 
    }
    ];

    const timer = setTimeout(() => {
      setWinners(mockData);
      setLoading(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="winners-section">
      <h2 className="winners-title">Our Recent Winners</h2>
      <p className="winners-subtitle">Excellence is not an act, but a habit. See those who reached the top.</p>

      <div className="winners-grid">
        {loading ? (
      
          Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="winner-card skeleton"></div>
          ))
        ) : (
          winners.map((winner) => (
            <div key={winner.id} className="winner-card">
              <img 
                src={winner.image} 
                alt={winner.title} 
                className="winner-image"
                loading="lazy"
              />
              <div className="winner-overlay">
                <div className="winner-info">
                  <span className="Winner-tagline">Winner</span>
                  <h3 className="card-title">{winner.title}</h3>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default OurRecentWinners;
