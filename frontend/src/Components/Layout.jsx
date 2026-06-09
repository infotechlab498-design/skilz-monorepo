import React from 'react'
import Header from './Header'
import Footer from './Footer'

const Layout = ({ children, hideSiteChrome = false }) => {
  return (
    <>
    {!hideSiteChrome && <Header />}
    {children}
    {!hideSiteChrome && <Footer />}
    </>
  );
};

export default Layout
