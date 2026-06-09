// import React from 'react'

// function Faqs() {
//   return (
//     <div>
//       Faqs Section
//     </div>
//   )
// }

// export default Faqs;

// export 


import React, { useState } from "react";
import "./styles/aboutus.css";
// import { FAQ_DUMMY_DATA } from "./faqData";

const Faqs = () => {



  const [activeId, setActiveId] = useState(null);

  const toggleFaq = (id) => {
    setActiveId((prev) => (prev === id ? null : id));
  };


const FAQ_DUMMY_DATA = [
  {
    id: "q1",
    question: "What is this platform about?",
    answer:
      "This platform allows users to play games, earn rewards, and compete with friends in real time."
  },
  {
    id: "q2",
    question: "How do I earn coins?",
    answer:
      "You can earn coins by winning games, completing challenges, and participating in tournaments."
  },
  {
    id: "q3",
    question: "Is my data secure?",
    answer:
      "Yes, all your data is securely stored and protected using industry-standard practices."
  },
  {
    id: "q4",
    question: "Can I play with friends?",
    answer:
      "Absolutely! You can invite friends and play multiplayer games together."
  }
];


  /*  Firebase ready (commented for now)
  useEffect(() => {
    const fetchFaqs = async () => {
      const snapshot = await getDocs(collection(db, "faqs"));
      setFaqs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchFaqs();
  }, []);
  */


  return (
    <div className="FAQ">
      <div className="div-wrapper">
        <div className="div">
          <h2 className="text-wrapper">FAQ</h2>
        </div>
      </div>

      <div className="faq-container">
        <div className="faq-list">
          {FAQ_DUMMY_DATA.map((faq) => (
            <div
              key={faq.id}
              className={`faq-item ${
                activeId === faq.id ? "active" : ""
              }`}
            >
              <div
                className="faq-question"
                onClick={() => toggleFaq(faq.id)}
              >
                <h4>{faq.question}</h4>
                <span className="icon">
                  {activeId === faq.id ? "−" : "+"}
                </span>
              </div>

              {activeId === faq.id && (
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


export default Faqs;
