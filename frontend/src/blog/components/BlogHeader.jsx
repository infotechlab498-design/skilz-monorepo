import React from 'react'
import { useLocation, Link } from "react-router-dom";
import "../styles/blogHeader.css";


function BlogHeader(){

    const location = useLocation();

  const pathSegments = location.pathname
    .split("/")
    .filter(Boolean);
  
  return (
    <div>
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
        <div className="blog-hero-content">

        <h1 className="blog-titl">
       <span className="contact-title"> Power-Ups, Tips & Game Insights
        </span> 
        </h1>

        <p className="contact-description">
          Questions, feedback, or support? Our team is ready to help you anytime.
        </p>
        </div>    
        
      
        
        
        </div>
  )
}

export default BlogHeader;