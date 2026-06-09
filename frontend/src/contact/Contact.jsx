import React from 'react'
import ContactHero from './ContactHero'
import ContactForm from './ContactForm'
import Layout from '../Components/Layout'

function ContactUs() {
  return (
    <div>
      <Layout>

        <ContactHero />
        <ContactForm />
      </Layout>
    </div>
  )
}
export default ContactUs